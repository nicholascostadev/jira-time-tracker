import {
  createCliRenderer,
  Box,
  Text,
  ASCIIFont,
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
import { getActiveTimer } from '../services/config.js';
import { colors } from './theme.js';

interface InteractiveTimerOptions {
  issue: JiraIssue;
  timer: TimerState;
}

export async function runInteractiveTimer(options: InteractiveTimerOptions): Promise<void> {
  const { issue } = options;

  let renderer: CliRenderer;
  let isExiting = false;
  let updateInterval: Timer | null = null;

  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: true,
      backgroundColor: colors.bg,
    });
  } catch (error) {
    console.error('Failed to initialize UI:', error);
    process.exit(1);
  }

  const cleanup = async (logTime: boolean = false) => {
    if (isExiting) return;
    isExiting = true;

    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    const stoppedTimer = stopTimer();

    renderer.destroy();

    if (logTime && stoppedTimer) {
      const elapsed = getElapsedSeconds(stoppedTimer);
      const timeStr = formatTimeHumanReadable(elapsed);

      console.log(`\nLogging ${timeStr} to ${issue.key}...`);

      try {
        await addWorklog(
          stoppedTimer.issueKey,
          elapsed,
          stoppedTimer.description,
          new Date(stoppedTimer.startedAt)
        );
        console.log(`Successfully logged ${timeStr} to ${issue.key}\n`);
      } catch (error) {
        console.error('Failed to log time');
        if (error instanceof Error) {
          console.error(`  Error: ${error.message}`);
        }
      }
    } else if (!logTime) {
      console.log('\nTimer cancelled. Time was not logged.\n');
    }

    process.exit(0);
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
          content: t`${bold(fg(colors.text)('jira time tracker'))}`,
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
              content: t`${dim('issue')}`,
              fg: colors.textDim,
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
              content: t`${dim('status')}`,
              fg: colors.textDim,
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
              content: t`${dim('work')}`,
              fg: colors.textDim,
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
          Text({
            content: statusText,
            fg: statusColor,
          }),
          // ASCII time - using white/gray for minimal look
          ASCIIFont({
            text: timeDisplay,
            font: 'block',
            color: currentTimer.isPaused ? colors.textMuted : colors.text,
          })
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

    // Clear existing children
    while (renderer.root.getChildrenCount() > 0) {
      const children = renderer.root.getChildren();
      if (children.length > 0) {
        renderer.root.remove(children[0].id);
      }
    }

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

  // Initial render
  render();

  // Update timer display every second
  updateInterval = setInterval(() => {
    if (!isExiting) {
      render();
    }
  }, 1000);

  // Keep the process alive
  renderer.start();
}
