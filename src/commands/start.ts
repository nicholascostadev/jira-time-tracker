import { createCliRenderer, type CliRenderer } from '@opentui/core';
import { ensureAuthenticated } from '../services/auth.js';
import { getIssue, getMyAssignedIssues, getCurrentUser } from '../services/jira.js';
import { createTimer, formatTime, getCurrentTimer, getElapsedSeconds, hasActiveTimer } from '../services/timer.js';
import { getFailedWorklogs } from '../services/config.js';
import { retryFailedWorklogs } from '../services/worklog-queue.js';
import type { JiraIssue } from '../types/index.js';
import { runInteractiveTimer } from '../ui/interactive.js';
import { selectIssueInteractive } from '../ui/issue-selection.js';
import { clearRenderer, showErrorScreen, showLoadingScreen } from '../ui/screens.js';
import { colors } from '../ui/theme.js';
import { destroyUI } from '../ui/react.js';

interface StartOptions {
  description?: string;
}

async function createSharedRenderer(): Promise<CliRenderer> {
  return await createCliRenderer({
    exitOnCtrlC: false,
    useAlternateScreen: true,
    backgroundColor: colors.bg,
  });
}

export async function startCommand(issueKey: string | undefined, options: StartOptions): Promise<void> {
  if (hasActiveTimer()) {
    const activeTimer = getCurrentTimer();
    if (activeTimer) {
      const elapsed = formatTime(getElapsedSeconds(activeTimer));
      console.log();
      console.log(`! timer already running for ${activeTimer.issueKey}`);
      console.log(`\x1b[90m  elapsed: ${elapsed}\x1b[0m`);
      console.log(`\x1b[90m  ${activeTimer.description}\x1b[0m`);
      console.log();
      console.log('run "jtt resume" to continue');
      console.log();
      process.exit(1);
    }
  }

  try {
    await ensureAuthenticated();
  } catch (error) {
    console.log();
    console.log(`x ${error instanceof Error ? error.message : 'Authentication failed'}`);
    console.log();
    process.exit(1);
  }

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

  let selectedIssue: JiraIssue;
  const renderer = await createSharedRenderer();

  if (issueKey) {
    const issueKeyUpper = issueKey.toUpperCase();
    if (!/^[A-Z]+-\d+$/.test(issueKeyUpper)) {
      await showErrorScreen(renderer, `Invalid issue key: ${issueKey}. Expected format: PROJECT-123`);
      destroyUI(renderer);
      process.exit(1);
    }

    selectedIssue = await showLoadingScreen(renderer, `fetching ${issueKeyUpper}`, () => getIssue(issueKeyUpper));

    const timer = createTimer(selectedIssue.key, '');
    const result = await runInteractiveTimer({
      issue: selectedIssue,
      timer,
      renderer,
      defaultDescription: options.description,
    });

    if (result.action === 'quit') {
      destroyUI(renderer);
      console.log('\nTimer cancelled. Time was not logged.\n');
      process.exit(0);
    }

    clearRenderer(renderer);
  }

  while (true) {
    const fetchResult = await showLoadingScreen(
      renderer,
      'fetching assigned issues',
      () => Promise.all([getMyAssignedIssues(), getCurrentUser()])
    );
    const assignedIssues = fetchResult[0];

    selectedIssue = await selectIssueInteractive(renderer, assignedIssues);

    const timer = createTimer(selectedIssue.key, '');
    const result = await runInteractiveTimer({
      issue: selectedIssue,
      timer,
      renderer,
      defaultDescription: options.description,
    });

    if (result.action === 'quit') {
      destroyUI(renderer);
      console.log('\nTimer cancelled. Time was not logged.\n');
      process.exit(0);
    }

    clearRenderer(renderer);
  }
}
