import {
  createCliRenderer,
  type CliRenderer,
} from '@opentui/core';
import { ensureAuthenticated } from '../services/auth.js';
import { getIssue } from '../services/jira.js';
import { getCurrentTimer, getElapsedSeconds, formatTime } from '../services/timer.js';
import { runInteractiveTimer } from '../ui/interactive.js';
import { colors } from '../ui/theme.js';
import { retryFailedWorklogs } from '../services/worklog-queue.js';
import { getFailedWorklogs } from '../services/config.js';
import { showLoadingScreen } from '../ui/screens.js';

/**
 * Creates a shared renderer for the resume flow, reused across all screens.
 */
async function createSharedRenderer(): Promise<CliRenderer> {
  return await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
    backgroundColor: colors.bg,
  });
}

export async function resumeCommand(): Promise<void> {
  // Check for active timer first (before authenticating)
  const timer = getCurrentTimer();
  if (!timer) {
    console.log();
    console.log('no active timer to resume');
    console.log('\x1b[90mrun "jtt start" to begin tracking\x1b[0m');
    console.log();
    process.exit(1);
  }

  // Ensure authenticated (config check + Jira client initialization)
  try {
    await ensureAuthenticated();
  } catch (error) {
    console.log();
    console.log(`x ${error instanceof Error ? error.message : 'Authentication failed'}`);
    console.log();
    process.exit(1);
  }

  // Retry any failed worklogs from the offline queue
  const pendingWorklogs = getFailedWorklogs();
  if (pendingWorklogs.length > 0) {
    const result = await retryFailedWorklogs();
    if (result.succeeded > 0) {
      console.log(`+ retried ${result.succeeded} pending worklog(s)`);
    }
    if (result.failed > 0) {
      console.log(`\x1b[90m  ${result.failed} worklog(s) still pending\x1b[0m`);
    }
  }

  // Create shared renderer for the entire resume flow
  const renderer = await createSharedRenderer();

  // Fetch issue using TUI loading screen
  const elapsed = formatTime(getElapsedSeconds(timer));
  const issue = await showLoadingScreen(
    renderer,
    `resuming ${timer.issueKey} (${elapsed})`,
    () => getIssue(timer.issueKey)
  );

  // Run interactive timer UI with the shared renderer
  const result = await runInteractiveTimer({ issue, timer, renderer });

  if (result.action === 'quit') {
    renderer.destroy();
    console.log('\nTimer cancelled. Time was not logged.\n');

    // Drain stdin to consume pending terminal capability responses, then exit
    drainAndExit(0);
    return;
  }

  // If logged, destroy renderer and exit cleanly
  renderer.destroy();
  drainAndExit(0);
}

function drainAndExit(code: number): void {
  if (!process.stdin.isTTY) { process.exit(code); return; }
  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => {});
    setTimeout(() => {
      try { process.stdin.setRawMode(false); } catch {}
      process.stdin.pause();
      process.exit(code);
    }, 200);
  } catch { process.exit(code); }
}
