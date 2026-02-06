import {
  createCliRenderer,
  Box,
  Text,
  ASCIIFont,
  measureText,
  t,
  bold,
  fg,
  dim,
  type CliRenderer,
  type KeyEvent,
} from '@opentui/core';
import type { TimerState, JiraIssue } from '../types/index.js';
import {
  pauseTimer,
  resumeTimer,
  stopTimer,
  getElapsedSeconds,
  formatTime,
  formatTimeHumanReadable,
} from '../services/timer.js';
import { addWorklog } from '../services/jira.js';
import { getActiveTimer, addFailedWorklog } from '../services/config.js';
import { colors } from './theme.js';
import { Spinner } from './components.js';

interface InteractiveTimerOptions {
  issue: JiraIssue;
  timer: TimerState;
  renderer?: CliRenderer;
}

export type TimerResult =
  | { action: 'logged' }
  | { action: 'quit' }
  | { action: 'error'; message: string };


function clearRenderer(renderer: CliRenderer): void {
  while (renderer.root.getChildrenCount() > 0) {
    const children = renderer.root.getChildren();
    if (children.length > 0) {
      renderer.root.remove(children[0].id);
    }
  }
}

export async function runInteractiveTimer(options: InteractiveTimerOptions): Promise<TimerResult> {
  const { issue } = options;
  const ownsRenderer = !options.renderer;

  let renderer: CliRenderer;
  let isExiting = false;
  let updateInterval: Timer | null = null;

  if (options.renderer) {
    renderer = options.renderer;
    // Remove old keypress listeners from previous pages
    renderer.keyInput.removeAllListeners('keypress');
  } else {
    try {
      renderer = await createCliRenderer({
        exitOnCtrlC: false,
        useAlternateScreen: true,
        backgroundColor: colors.bg,
      });
    } catch (error) {
      throw new Error(`Failed to initialize UI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return new Promise<TimerResult>((resolve) => {
    const cleanup = async (logTime: boolean) => {
      if (isExiting) return;
      isExiting = true;

      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }

      const stoppedTimer = stopTimer();

      if (logTime && stoppedTimer) {
        const elapsed = getElapsedSeconds(stoppedTimer);
        const isUnderMinimum = elapsed < 60;
        const loggedTimeStr = isUnderMinimum ? '1 minute' : formatTimeHumanReadable(elapsed);
        const timeStr = formatTimeHumanReadable(elapsed);

        // Show logging screen in the same renderer
        let spinnerIndex = 0;
        const renderLogging = () => {
          clearRenderer(renderer);
          renderer.root.add(
            Box(
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
                  gap: 1,
                  borderStyle: 'rounded',
                  borderColor: colors.border,
                  border: true,
                },
                Spinner(spinnerIndex),
                Box(
                  { marginTop: 1 },
                  Text({
                    content: `logging ${loggedTimeStr} to ${issue.key}`,
                    fg: colors.textMuted,
                  })
                ),
                ...(isUnderMinimum
                  ? [
                      Text({
                        content: `tracked ${timeStr} — Jira requires a minimum of 1 minute`,
                        fg: colors.textDim,
                      }),
                    ]
                  : [])
              )
            )
          );
        };

        renderLogging();
        const loggingInterval = setInterval(() => {
          spinnerIndex++;
          renderLogging();
        }, 300);

        try {
          await addWorklog(
            stoppedTimer.issueKey,
            elapsed,
            stoppedTimer.description,
            new Date(stoppedTimer.startedAt)
          );
        } catch (error) {
          // Worklog failed — save to offline queue for later retry
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          addFailedWorklog({
            issueKey: stoppedTimer.issueKey,
            timeSpentSeconds: elapsed,
            comment: stoppedTimer.description,
            started: new Date(stoppedTimer.startedAt).toISOString(),
            failedAt: Date.now(),
            error: errorMessage,
          });
          clearInterval(loggingInterval);
          clearRenderer(renderer);
          renderer.root.add(
            Box(
              {
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                backgroundColor: colors.bg,
              },
              Text({
                content: `Failed to log time: ${errorMessage}`,
                fg: colors.error,
              }),
              Text({
                content: 'The worklog has been saved offline for retry.',
                fg: colors.textMuted,
              })
            )
          );
          await new Promise((r) => setTimeout(r, 2500));
          if (ownsRenderer) {
            renderer.destroy();
          }
          resolve({ action: 'error', message: errorMessage });
          return;
        }

        clearInterval(loggingInterval);

        // Show success briefly
        clearRenderer(renderer);
        renderer.root.add(
          Box(
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
                borderColor: colors.success,
                border: true,
              },
              Text({
                content: `+ logged ${loggedTimeStr} to ${issue.key}`,
                fg: colors.success,
              }),
              ...(isUnderMinimum
                ? [
                    Box(
                      { marginTop: 1 },
                      Text({
                        content: `tracked ${timeStr} — rounded up to Jira's 1 minute minimum`,
                        fg: colors.textDim,
                      })
                    ),
                  ]
                : [])
            )
          )
        );
        await new Promise((r) => setTimeout(r, 1500));

        resolve({ action: 'logged' });
      } else {
        // Quit without logging
        if (ownsRenderer) {
          renderer.destroy();
        }
        resolve({ action: 'quit' });
      }
    };

    const buildUI = () => {
      const currentTimer = getActiveTimer();
      if (!currentTimer) return null;

      const elapsed = getElapsedSeconds(currentTimer);
      const timeDisplay = formatTime(elapsed);
      const statusText = currentTimer.isPaused ? 'PAUSED' : 'RUNNING';
      const statusColor = currentTimer.isPaused ? colors.timerPaused : colors.timerRunning;
      const borderColor = currentTimer.isPaused ? colors.border : colors.borderActive;

      // Build hints based on current state
      const hints = currentTimer.isPaused
        ? [
            { key: 'r', desc: 'Resume', color: colors.text },
            { key: 's', desc: 'Stop & Log', color: colors.textMuted },
            { key: 'q', desc: 'Quit', color: colors.textDim },
          ]
        : [
            { key: 'p', desc: 'Pause', color: colors.text },
            { key: 's', desc: 'Stop & Log', color: colors.textMuted },
            { key: 'q', desc: 'Quit', color: colors.textDim },
          ];

      return Box(
        {
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          padding: 1,
          backgroundColor: colors.bg,
        },
        // Header - minimal
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
        // Main content panel
        Box(
          {
            width: '100%',
            flexGrow: 1,
            flexDirection: 'column',
            borderStyle: 'rounded',
            borderColor: borderColor,
            border: true,
            padding: 1,
          },
          // Issue info - compact
          Box(
            {
              flexDirection: 'column',
              marginBottom: 1,
            },
            Box(
              {
                flexDirection: 'row',
                gap: 1,
              },
              Text({
                content: 'ISSUE:',
                fg: colors.textLabel,
              }),
              Text({
                content: t`${bold(issue.key)}`,
                fg: colors.text,
              }),
              Text({
                content: issue.summary,
                fg: colors.textMuted,
              })
            ),
            Box(
              {
                flexDirection: 'row',
                gap: 1,
              },
              Text({
                content: 'STATUS:',
                fg: colors.textLabel,
              }),
              Text({
                content: issue.status,
                fg: colors.textMuted,
              })
            ),
            Box(
              {
                flexDirection: 'row',
                gap: 1,
              },
              Text({
                content: 'WORK:',
                fg: colors.textLabel,
              }),
              Text({
                content: currentTimer.description,
                fg: colors.textMuted,
              })
            )
          ),
          // Timer display
          Box(
            {
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
            },
            // Status badge
            Box(
              {
                marginBottom: 1,
              },
              Text({
                content: statusText,
                fg: statusColor,
              })
            ),
            // ASCII time - each digit in a fixed-width cell to prevent shifting
            ...(() => {
              const font = 'block' as const;
              const timerColor = currentTimer.isPaused ? colors.textMuted : colors.text;
              // Find the widest digit to use as fixed cell width
              const maxDigitWidth = Math.max(
                ...('0123456789'.split('').map(d => measureText({ text: d, font }).width))
              );
              const colonWidth = measureText({ text: ':', font }).width;
              const fontHeight = measureText({ text: '0', font }).height;

              return [Box(
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                ...timeDisplay.split('').map((char, i) =>
                  Box(
                    {
                      width: char === ':' ? colonWidth : maxDigitWidth,
                      height: fontHeight,
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    ASCIIFont({
                      text: char,
                      font,
                      color: timerColor,
                    })
                  )
                )
              )];
            })()
          ),
          // Key hints - minimal style
          Box(
            {
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 4,
              marginTop: 1,
            },
            ...hints.map((hint) =>
              Box(
                {
                  flexDirection: 'row',
                  gap: 1,
                },
                Text({
                  content: `[${hint.key}]`,
                  fg: hint.color,
                }),
                Text({
                  content: hint.desc,
                  fg: colors.textDim,
                })
              )
            )
          )
        )
      );
    };

    const render = () => {
      if (isExiting) return;

      clearRenderer(renderer);

      const ui = buildUI();
      if (ui) {
        renderer.root.add(ui);
      }
    };

    // Handle key presses
    renderer.keyInput.on('keypress', (key: KeyEvent) => {
      if (isExiting) return;

      const currentTimer = getActiveTimer();
      if (!currentTimer) return;

      const keyName = key.name?.toLowerCase();

      switch (keyName) {
        case 'p':
          if (!currentTimer.isPaused) {
            pauseTimer();
            render();
          }
          break;

        case 'r':
          if (currentTimer.isPaused) {
            resumeTimer();
            render();
          }
          break;

        case 's':
          cleanup(true);
          break;

        case 'q':
        case 'escape':
          cleanup(false);
          break;
      }
    });

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      cleanup(false);
    });

    // Hide cursor - no text input on this screen
    renderer.setCursorPosition(0, 0, false);

    // Initial render
    render();

    // Update timer display every second
    updateInterval = setInterval(() => {
      if (!isExiting) {
        render();
      }
    }, 1000);

    // Start the renderer if we own it (not shared)
    if (ownsRenderer) {
      renderer.start();
    }
  });
}
