import {
  createCliRenderer,
  Box,
  Text,
  Input,
  ASCIIFont,
  measureText,
  t,
  bold,
  fg,
  dim,
  type CliRenderer,
  type KeyEvent,
  type InputRenderable,
} from '@opentui/core';
import type { TimerState, JiraIssue } from '../types/index.js';
import {
  pauseTimer,
  resumeTimer,
  stopTimer,
  getElapsedSeconds,
  getWorklogSegments,
  formatTime,
  formatTimeHumanReadable,
} from '../services/timer.js';
import { addWorklog } from '../services/jira.js';
import { getActiveTimer, addFailedWorklog, getDefaultWorklogMessage, setDefaultWorklogMessage } from '../services/config.js';
import { colors } from './theme.js';
import { Spinner } from './components.js';

interface InteractiveTimerOptions {
  issue: JiraIssue;
  timer: TimerState;
  renderer?: CliRenderer;
  defaultDescription?: string;
}

export type TimerResult =
  | { action: 'logged' }
  | { action: 'quit' }
  | { action: 'error'; message: string };

type WorklogMode = 'single' | 'split';

const QUIT_CONFIRM_THRESHOLD_SECONDS = 5 * 60;
const ASCII_FONT = 'block' as const;
const MAX_DIGIT_WIDTH = Math.max(
  ...('0123456789'.split('').map((d) => measureText({ text: d, font: ASCII_FONT }).width))
);
const COLON_WIDTH = measureText({ text: ':', font: ASCII_FONT }).width;
const FONT_HEIGHT = measureText({ text: '0', font: ASCII_FONT }).height;


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
    let showQuitConfirm = false;
    let currentScreen: 'timer' | 'description' | 'review' = 'timer';
    let saveAsDefault = false;

    const onSigint = () => {
      if (currentScreen === 'description' || currentScreen === 'review') {
        // On description screen, Ctrl+C resumes the timer
        resumeTimer();
        currentScreen = 'timer';
        showQuitConfirm = false;
        startTimerScreen();
        return;
      }

      const currentTimer = getActiveTimer();
      if (!currentTimer) {
        void quit();
        return;
      }

      const elapsed = getElapsedSeconds(currentTimer);
      if (elapsed >= QUIT_CONFIRM_THRESHOLD_SECONDS) {
        showQuitConfirm = true;
        renderTimer();
        return;
      }

      void quit();
    };

    const quit = async () => {
      if (isExiting) return;
      isExiting = true;
      process.removeListener('SIGINT', onSigint);

      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }

      stopTimer();

      if (ownsRenderer) {
        renderer.destroy();
      }
      resolve({ action: 'quit' });
    };

    const formatClock = (timestamp: number): string => {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
    };

    const logWorklog = async (description: string, mode: WorklogMode) => {
      if (isExiting) return;
      isExiting = true;
      process.removeListener('SIGINT', onSigint);

      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }

      const stoppedTimer = stopTimer();

      if (!stoppedTimer) {
        if (ownsRenderer) {
          renderer.destroy();
        }
        resolve({ action: 'quit' });
        return;
      }

      const elapsed = getElapsedSeconds(stoppedTimer);
      const segments = getWorklogSegments(stoppedTimer);

      const worklogsToPost = mode === 'split' && segments.length > 1
        ? segments.map((segment) => ({
            startedAt: segment.startedAt,
            durationSeconds: segment.durationSeconds,
          }))
        : [{
            startedAt: segments[0]?.startedAt ?? stoppedTimer.startedAt,
            durationSeconds: elapsed,
          }];

      const loggedTimeStr = formatTimeHumanReadable(elapsed < 60 ? 60 : elapsed);
      const roundedSegmentsCount = worklogsToPost.filter((entry) => entry.durationSeconds < 60).length;
      const isSingleEntry = worklogsToPost.length === 1;

      // Show logging screen in the same renderer
      renderer.keyInput.removeAllListeners('keypress');
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
                  content: `logging ${worklogsToPost.length} ${worklogsToPost.length === 1 ? 'entry' : 'entries'} to ${issue.key}`,
                  fg: colors.textMuted,
                })
              ),
              ...((isSingleEntry && worklogsToPost[0].durationSeconds < 60)
                ? [
                    Text({
                      content: `tracked ${formatTimeHumanReadable(worklogsToPost[0].durationSeconds)} — Jira requires a minimum of 1 minute`,
                      fg: colors.textDim,
                    }),
                  ]
                : []),
              ...(roundedSegmentsCount > 0 && !isSingleEntry
                ? [
                    Text({
                      content: `${roundedSegmentsCount} short segment${roundedSegmentsCount === 1 ? '' : 's'} will be rounded to 1 minute`,
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

      let failedCount = 0;
      let firstErrorMessage = '';

      for (const entry of worklogsToPost) {
        try {
          await addWorklog(
            stoppedTimer.issueKey,
            entry.durationSeconds,
            description,
            new Date(entry.startedAt)
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (!firstErrorMessage) {
            firstErrorMessage = errorMessage;
          }
          failedCount++;
          addFailedWorklog({
            issueKey: stoppedTimer.issueKey,
            timeSpentSeconds: entry.durationSeconds,
            comment: description,
            started: new Date(entry.startedAt).toISOString(),
            failedAt: Date.now(),
            error: errorMessage,
          });
        }
      }

      if (failedCount > 0) {
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
              content: failedCount === worklogsToPost.length
                ? `Failed to log time: ${firstErrorMessage}`
                : `Logged ${worklogsToPost.length - failedCount}/${worklogsToPost.length}. ${failedCount} saved offline.`,
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
        resolve({ action: 'error', message: firstErrorMessage || 'Some worklogs failed to post' });
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
              content: `+ logged ${worklogsToPost.length} ${worklogsToPost.length === 1 ? 'entry' : 'entries'} (${loggedTimeStr}) to ${issue.key}`,
              fg: colors.success,
            }),
            ...((isSingleEntry && worklogsToPost[0].durationSeconds < 60)
              ? [
                  Box(
                    { marginTop: 1 },
                    Text({
                      content: `tracked ${formatTimeHumanReadable(worklogsToPost[0].durationSeconds)} — rounded up to Jira's 1 minute minimum`,
                      fg: colors.textDim,
                    })
                  ),
                ]
              : []),
            ...(roundedSegmentsCount > 0 && !isSingleEntry
              ? [
                  Box(
                    { marginTop: 1 },
                    Text({
                      content: `${roundedSegmentsCount} short segment${roundedSegmentsCount === 1 ? '' : 's'} rounded up to Jira's 1 minute minimum`,
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
    };

    // ── Description input screen (shown after pressing [s]) ──

    const buildDescriptionUI = () => {
      const defaultToggleText = saveAsDefault
        ? '* will save as default'
        : '  save as default';

      return Box(
        {
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          padding: 1,
          backgroundColor: colors.bg,
        },
        // Header
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
            content: t`${bold(fg(colors.text)('WORK DESCRIPTION'))}`,
          })
        ),
        // Input section
        Box(
          {
            flexDirection: 'column',
            gap: 1,
          },
          Text({
            content: `What did you work on for ${issue.key}?`,
            fg: colors.text,
          }),
          Box(
            {
              borderStyle: 'rounded',
              borderColor: colors.borderFocused,
              border: true,
              height: 3,
              width: '100%',
            },
            Input({
              id: 'worklog-description-input',
              width: '100%',
              value: '',
              placeholder: 'Describe your work...',
            })
          ),
          // Save as default toggle
          Text({
            content: defaultToggleText,
            fg: saveAsDefault ? colors.success : colors.textDim,
          })
        ),
        // Footer hints
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 2,
          },
          Text({
            content: '[enter] review',
            fg: colors.textDim,
          }),
          Text({
            content: '[tab] save as default',
            fg: colors.textDim,
          }),
          Text({
            content: '[esc] resume timer',
            fg: colors.textDim,
          })
        )
      );
    };

    const renderDescription = () => {
      clearRenderer(renderer);
      renderer.root.add(buildDescriptionUI());

      setTimeout(() => {
        const input = renderer.root.findDescendantById('worklog-description-input');
        if (input) {
          input.focus();
        }
      }, 50);
    };

    const buildReviewUI = (description: string, selectedMode: WorklogMode) => {
      const currentTimer = getActiveTimer();
      if (!currentTimer) {
        return null;
      }

      const elapsed = getElapsedSeconds(currentTimer);
      const segments = getWorklogSegments(currentTimer);
      const hasSplitOptions = segments.length > 1;
      const previewSegments = hasSplitOptions
        ? segments
        : [{
            startedAt: currentTimer.startedAt,
            endedAt: Date.now(),
            durationSeconds: elapsed,
          }];

      const singleRounded = elapsed < 60;

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
            content: t`${bold(fg(colors.text)('REVIEW WORKLOG'))}`,
          })
        ),
        Box(
          {
            width: '100%',
            flexGrow: 1,
            flexDirection: 'column',
            borderStyle: 'rounded',
            borderColor: colors.border,
            border: true,
            padding: 1,
            gap: 1,
          },
          Text({ content: `Issue: ${issue.key}`, fg: colors.text }),
          Text({ content: `Description: ${description}`, fg: colors.textMuted }),
          Text({ content: `Total tracked: ${formatTimeHumanReadable(elapsed)}`, fg: colors.text }),
          Text({
            content: selectedMode === 'single' ? '* single entry' : '  single entry',
            fg: selectedMode === 'single' ? colors.success : colors.textDim,
          }),
          Text({
            content: `  ${formatClock(previewSegments[0].startedAt)} -> ${formatClock(previewSegments[previewSegments.length - 1].endedAt)} (${formatTimeHumanReadable(elapsed < 60 ? 60 : elapsed)})${singleRounded ? ' rounded if under 60s' : ''}`,
            fg: colors.textDim,
          }),
          Text({
            content: hasSplitOptions
              ? (selectedMode === 'split' ? '* split entries' : '  split entries')
              : '  split entries (not available)',
            fg: hasSplitOptions
              ? (selectedMode === 'split' ? colors.success : colors.textDim)
              : colors.textDim,
          }),
          ...previewSegments.map((segment, index) => {
            const rounded = segment.durationSeconds < 60;
            return Text({
              content: `  ${index + 1}. ${formatClock(segment.startedAt)} -> ${formatClock(segment.endedAt)} (${formatTimeHumanReadable(segment.durationSeconds < 60 ? 60 : segment.durationSeconds)})${rounded ? ' rounded' : ''}`,
              fg: colors.textDim,
            });
          })
        ),
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 1,
          },
          Text({ content: '[enter] confirm', fg: colors.textDim }),
          Text({
            content: hasSplitOptions ? '[tab] toggle single/split' : '[tab] no split available',
            fg: colors.textDim,
          }),
          Text({ content: '[esc] back', fg: colors.textDim })
        )
      );
    };

    const showReviewScreen = (description: string) => {
      currentScreen = 'review';
      renderer.keyInput.removeAllListeners('keypress');

      const currentTimer = getActiveTimer();
      if (!currentTimer) {
        void quit();
        return;
      }

      const hasSplitOptions = getWorklogSegments(currentTimer).length > 1;
      let selectedMode: WorklogMode = hasSplitOptions ? 'split' : 'single';

      const renderReview = () => {
        clearRenderer(renderer);
        const reviewUI = buildReviewUI(description, selectedMode);
        if (reviewUI) {
          renderer.root.add(reviewUI);
        }
      };

      renderReview();

      renderer.keyInput.on('keypress', (key: KeyEvent) => {
        if (key.name === 'escape') {
          showDescriptionScreen(description, true);
          return;
        }

        if (key.name === 'tab' || key.name === 'left' || key.name === 'right') {
          if (!hasSplitOptions) {
            return;
          }
          selectedMode = selectedMode === 'single' ? 'split' : 'single';
          renderReview();
          return;
        }

        if (key.name === 'return' || key.name === 'enter') {
          void logWorklog(description, selectedMode);
        }
      });
    };

    const showDescriptionScreen = (initialValue?: string, keepDefaultToggle = false) => {
      currentScreen = 'description';
      if (!keepDefaultToggle) {
        saveAsDefault = false;
      }

      // Pause the timer while entering description
      const currentTimer = getActiveTimer();
      if (currentTimer && !currentTimer.isPaused) {
        pauseTimer();
      }

      // Stop the timer update interval
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }

      renderer.keyInput.removeAllListeners('keypress');

      // Pre-fill value: CLI -d flag takes priority, then saved default
      const prefillValue = initialValue ?? options.defaultDescription ?? getDefaultWorklogMessage();

      renderDescription();

      // Set the pre-fill value after render
      if (prefillValue) {
        setTimeout(() => {
          const input = renderer.root.findDescendantById('worklog-description-input') as InputRenderable | undefined;
          if (input) {
            input.value = prefillValue;
          }
        }, 60);
      }

      renderer.keyInput.on('keypress', (key: KeyEvent) => {
        if (key.name === 'escape') {
          // Resume timer and go back to timer screen
          resumeTimer();
          currentScreen = 'timer';
          showQuitConfirm = false;
          startTimerScreen();
          return;
        }

        if (key.name === 'tab') {
          saveAsDefault = !saveAsDefault;
          // Re-render to update toggle text, preserving input value
          const input = renderer.root.findDescendantById('worklog-description-input') as InputRenderable | undefined;
          const currentValue = input?.value || '';
          renderDescription();
          // Restore input value
          setTimeout(() => {
            const newInput = renderer.root.findDescendantById('worklog-description-input') as InputRenderable | undefined;
            if (newInput) {
              newInput.value = currentValue;
              newInput.focus();
            }
          }, 60);
          return;
        }

        if (key.name === 'return' || key.name === 'enter') {
          const input = renderer.root.findDescendantById('worklog-description-input') as InputRenderable | undefined;
          if (input) {
            const value = input.value.trim();
            if (!value) {
              // Don't allow empty — just ignore the enter press
              return;
            }
            if (saveAsDefault) {
              setDefaultWorklogMessage(value);
            }
            showReviewScreen(value);
          }
          return;
        }
      });
    };

    // ── Timer screen ──

    const buildTimerUI = () => {
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
          // Issue info - compact (no WORK: label since description comes later)
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
              const timerColor = currentTimer.isPaused ? colors.textMuted : colors.text;

              return [Box(
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                ...timeDisplay.split('').map((char) =>
                  Box(
                    {
                      width: char === ':' ? COLON_WIDTH : MAX_DIGIT_WIDTH,
                      height: FONT_HEIGHT,
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    ASCIIFont({
                      text: char,
                      font: ASCII_FONT,
                      color: timerColor,
                    })
                  )
                )
              )];
            })()
          ),
          ...(showQuitConfirm
            ? [
                Box(
                  {
                    borderStyle: 'rounded',
                    borderColor: colors.warning,
                    border: true,
                    padding: 1,
                    marginTop: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 1,
                  },
                  Text({
                    content: 'Discard tracked time without logging?',
                    fg: colors.warning,
                  }),
                  Text({
                    content: '[y] discard  [n] continue tracking',
                    fg: colors.textDim,
                  })
                ),
              ]
            : []),
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

    const renderTimer = () => {
      if (isExiting) return;

      clearRenderer(renderer);

      const ui = buildTimerUI();
      if (ui) {
        renderer.root.add(ui);
      }
    };

    const startTimerScreen = () => {
      currentScreen = 'timer';

      renderer.keyInput.removeAllListeners('keypress');

      // Handle key presses
      renderer.keyInput.on('keypress', (key: KeyEvent) => {
        if (isExiting) return;

        const currentTimer = getActiveTimer();
        if (!currentTimer) return;

        const keyName = key.name?.toLowerCase();

        switch (keyName) {
          case 'y':
            if (showQuitConfirm) {
              void quit();
            }
            break;

          case 'n':
            if (showQuitConfirm) {
              showQuitConfirm = false;
              renderTimer();
            }
            break;

          case 'p':
            if (showQuitConfirm) {
              break;
            }
            if (!currentTimer.isPaused) {
              pauseTimer();
              renderTimer();
            }
            break;

          case 'r':
            if (showQuitConfirm) {
              break;
            }
            if (currentTimer.isPaused) {
              resumeTimer();
              renderTimer();
            }
            break;

          case 's':
            if (showQuitConfirm) {
              break;
            }
            showDescriptionScreen();
            break;

          case 'q':
          case 'escape':
            if (showQuitConfirm) {
              showQuitConfirm = false;
              renderTimer();
              break;
            }

            if (getElapsedSeconds(currentTimer) >= QUIT_CONFIRM_THRESHOLD_SECONDS) {
              showQuitConfirm = true;
              renderTimer();
            } else {
              void quit();
            }
            break;
        }
      });

      // Hide cursor - no text input on this screen
      renderer.setCursorPosition(0, 0, false);

      // Initial render
      renderTimer();

      // Update timer display every second
      updateInterval = setInterval(() => {
        if (!isExiting && currentScreen === 'timer') {
          renderTimer();
        }
      }, 1000);
    };

    // Handle Ctrl+C
    process.on('SIGINT', onSigint);

    // Start with the timer screen
    startTimerScreen();

    // Start the renderer if we own it (not shared)
    if (ownsRenderer) {
      renderer.start();
    }
  });
}
