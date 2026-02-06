// Reusable OpenTUI components for Jira Time Tracker
// Minimal opencode/vercel-style aesthetic
import {
  Box,
  Text,
  ASCIIFont,
  t,
  bold,
  fg,
  dim,
} from '@opentui/core';
import { colors } from './theme.js';

/**
 * Creates the app header with the title - minimal style
 */
export function Header(): ReturnType<typeof Box> {
  return Box(
    {
      width: '100%',
      height: 3,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderStyle: 'rounded',
      borderColor: colors.border,
      border: true,
    },
    Text({
      content: t`${bold(fg(colors.text)('JIRA TIME TRACKER'))}`,
    })
  );
}

/**
 * Creates a panel with a title and border
 */
export function Panel(
  options: {
    title?: string;
    width?: number | string;
    height?: number | string;
    borderColor?: string;
  },
  ...children: ReturnType<typeof Box>[]
): ReturnType<typeof Box> {
  const { title, width = '100%', height, borderColor = colors.border } = options;

  return Box(
    {
      width: width as any,
      height: height as any,
      flexDirection: 'column',
      borderStyle: 'rounded',
      borderColor,
      border: true,
      padding: 1,
      title: title ? ` ${title} ` : undefined,
    },
    ...children
  );
}

/**
 * Creates a status bar showing a key-value pair - minimal style
 */
export function StatusItem(
  label: string,
  value: string,
  valueColor: string = colors.textMuted
): ReturnType<typeof Box> {
  return Box(
    {
      flexDirection: 'row',
      gap: 1,
    },
    Text({
      content: t`${dim(label)}`,
      fg: colors.textDim,
    }),
    Text({
      content: value,
      fg: valueColor,
    })
  );
}

/**
 * Creates a keyboard shortcut hint - minimal style
 */
export function KeyHint(key: string, description: string): ReturnType<typeof Box> {
  return Box(
    {
      flexDirection: 'row',
      gap: 1,
    },
    Text({
      content: `[${key}]`,
      fg: colors.text,
    }),
    Text({
      content: description,
      fg: colors.textDim,
    })
  );
}

/**
 * Creates a row of keyboard shortcuts
 */
export function KeyHintsRow(...hints: { key: string; description: string }[]): ReturnType<typeof Box> {
  const hintComponents = hints.map(({ key, description }) => KeyHint(key, description));
  
  return Box(
    {
      flexDirection: 'row',
      gap: 3,
      justifyContent: 'center',
    },
    ...hintComponents
  );
}

/**
 * Creates a large ASCII time display
 */
export function TimerDisplay(
  time: string,
  status: 'running' | 'paused' | 'stopped' = 'running'
): ReturnType<typeof Box> {
  // Minimal: white when running, muted when paused/stopped
  const timerColor = status === 'running' ? colors.text : colors.textMuted;

  return Box(
    {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ASCIIFont({
      text: time,
      font: 'block',
      color: timerColor,
    })
  );
}

/**
 * Creates a message box (info, success, warning, error)
 */
export function MessageBox(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): ReturnType<typeof Box> {
  const typeColors = {
    info: colors.textMuted,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
  };

  const typeIcons = {
    info: '.',
    success: '+',
    warning: '!',
    error: 'x',
  };

  return Box(
    {
      flexDirection: 'row',
      gap: 1,
      padding: 1,
      borderStyle: 'rounded',
      borderColor: colors.border,
      border: true,
    },
    Text({
      content: typeIcons[type],
      fg: typeColors[type],
    }),
    Text({
      content: message,
      fg: colors.text,
    })
  );
}

/**
 * Creates a simple loading spinner text
 */
export function LoadingText(message: string): ReturnType<typeof Box> {
  return Box(
    {
      flexDirection: 'row',
      gap: 1,
    },
    Text({
      content: '...',
      fg: colors.textMuted,
    }),
    Text({
      content: message,
      fg: colors.textDim,
    })
  );
}

/**
 * Creates a large animated spinner using 3 bouncing dots.
 * Each dot is a 3-wide × 2-tall block. Pass a frame index that increments over time.
 */
export function Spinner(frameIndex: number): ReturnType<typeof Box> {
  const DOT = '███';
  const activeIndex = frameIndex % 3;

  return Box(
    {
      flexDirection: 'row',
      gap: 2,
      alignItems: 'center',
    },
    ...[0, 1, 2].map((i) =>
      Box(
        { flexDirection: 'column' },
        Text({ content: DOT, fg: i === activeIndex ? colors.text : colors.textDim }),
        Text({ content: DOT, fg: i === activeIndex ? colors.text : colors.textDim }),
      )
    )
  );
}

/**
 * Creates a divider line
 */
export function Divider(width: number = 40): ReturnType<typeof Text> {
  return Text({
    content: '─'.repeat(width),
    fg: colors.border,
  });
}

/**
 * Creates an issue display row - minimal style
 */
export function IssueDisplay(
  issueKey: string,
  summary: string,
  status: string
): ReturnType<typeof Box> {
  return Box(
    {
      flexDirection: 'column',
      gap: 0,
    },
    Box(
      {
        flexDirection: 'row',
        gap: 1,
      },
      Text({
        content: t`${bold(issueKey)}`,
        fg: colors.text,
      }),
      Text({
        content: summary,
        fg: colors.textMuted,
      })
    ),
    Box(
      {
        flexDirection: 'row',
        gap: 1,
        marginLeft: 2,
      },
      Text({
        content: t`${dim('status')}`,
        fg: colors.textDim,
      }),
      Text({
        content: status,
        fg: colors.textMuted,
      })
    )
  );
}
