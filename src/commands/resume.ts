import {
  createCliRenderer,
  Box,
  Text,
  t,
  bold,
  fg,
  type CliRenderer,
  type KeyEvent,
} from '@opentui/core';
import { ensureAuthenticated } from '../services/auth.js';
import { getIssue } from '../services/jira.js';
import { getCurrentTimer, getElapsedSeconds, formatTime } from '../services/timer.js';
import { runInteractiveTimer } from '../ui/interactive.js';
import { Spinner } from '../ui/components.js';
import { colors } from '../ui/theme.js';
import { retryFailedWorklogs } from '../services/worklog-queue.js';
import { getFailedWorklogs } from '../services/config.js';

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

/**
 * Clears all children from the renderer root, preparing for a new page.
 */
function clearRenderer(renderer: CliRenderer): void {
  while (renderer.root.getChildrenCount() > 0) {
    const children = renderer.root.getChildren();
    if (children.length > 0) {
      renderer.root.remove(children[0].id);
    }
  }
}

/**
 * Shows a loading screen with a spinner. On failure, shows error with retry/quit.
 */
async function showLoadingScreen<T>(
  renderer: CliRenderer,
  message: string,
  task: () => Promise<T>
): Promise<T> {
  while (true) {
    let spinnerIndex = 0;
    let spinnerInterval: Timer | null = null;

    renderer.keyInput.removeAllListeners('keypress');

    const buildLoadingUI = () => {
      return Box(
        {
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          padding: 1,
          backgroundColor: colors.bg,
        },
        Box(
          {
            width: '100%',
            height: 3,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderStyle: 'rounded',
            borderColor: colors.border,
            border: true,
            marginBottom: 1,
          },
          Text({
            content: t`${bold(fg(colors.text)('JIRA TIME TRACKER'))}`,
          })
        ),
        Box(
          {
            width: '100%',
            flexGrow: 1,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderStyle: 'rounded',
            borderColor: colors.border,
            border: true,
          },
          Spinner(spinnerIndex),
          Box(
            { marginTop: 1 },
            Text({
              content: message,
              fg: colors.textMuted,
            })
          )
        )
      );
    };

    const renderLoading = () => {
      clearRenderer(renderer);
      renderer.root.add(buildLoadingUI());
    };

    renderLoading();

    spinnerInterval = setInterval(() => {
      spinnerIndex++;
      renderLoading();
    }, 300);

    try {
      const result = await task();
      clearInterval(spinnerInterval);
      return result;
    } catch (error) {
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const userAction = await showErrorScreen(renderer, errorMessage);

      if (userAction === 'retry') {
        continue;
      } else {
        renderer.destroy();
        console.log('\nCancelled.\n');
        process.exit(1);
      }
    }
  }
}

/**
 * Shows an error screen with [r] retry / [q] quit options.
 */
function showErrorScreen(renderer: CliRenderer, errorMessage: string): Promise<'retry' | 'quit'> {
  return new Promise((resolve) => {
    renderer.keyInput.removeAllListeners('keypress');

    const buildUI = () => {
      return Box(
        {
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          padding: 1,
          backgroundColor: colors.bg,
        },
        Box(
          {
            width: '100%',
            height: 3,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderStyle: 'rounded',
            borderColor: colors.border,
            border: true,
            marginBottom: 1,
          },
          Text({
            content: t`${bold(fg(colors.text)('JIRA TIME TRACKER'))}`,
          })
        ),
        Box(
          {
            width: '100%',
            flexGrow: 1,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            borderStyle: 'rounded',
            borderColor: colors.error,
            border: true,
          },
          Text({
            content: 'SOMETHING WENT WRONG',
            fg: colors.error,
          }),
          Text({
            content: errorMessage,
            fg: colors.textMuted,
          }),
          Box(
            {
              flexDirection: 'row',
              gap: 3,
              marginTop: 1,
            },
            Text({
              content: '[r] retry',
              fg: colors.text,
            }),
            Text({
              content: '[q] quit',
              fg: colors.textDim,
            })
          )
        )
      );
    };

    clearRenderer(renderer);
    renderer.root.add(buildUI());

    renderer.keyInput.on('keypress', (key: KeyEvent) => {
      const keyName = key.name?.toLowerCase();
      if (keyName === 'r') {
        resolve('retry');
      } else if (keyName === 'q' || keyName === 'escape') {
        resolve('quit');
      }
    });
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

  // Ensure authenticated (handles config check and OAuth token refresh)
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
