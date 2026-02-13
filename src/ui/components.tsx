import type { ReactNode } from 'react';
import { colors } from './theme.js';

export function Header(): ReactNode {
  return (
    <box
      width="100%"
      height={3}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      borderStyle="rounded"
      borderColor={colors.border}
      border
    >
      <text content="JIRA TIME TRACKER" fg={colors.text} />
    </box>
  );
}

export function Panel(
  options: {
    title?: string;
    width?: number | 'auto' | `${number}%`;
    height?: number | 'auto' | `${number}%`;
    borderColor?: string;
  },
  ...children: ReactNode[]
): ReactNode {
  const { title, width = '100%', height, borderColor = colors.border } = options;

  return (
    <box
      width={width}
      height={height}
      flexDirection="column"
      borderStyle="rounded"
      borderColor={borderColor}
      border
      padding={1}
      title={title ? ` ${title} ` : undefined}
    >
      {children}
    </box>
  );
}

export function StatusItem(label: string, value: string, valueColor: string = colors.textMuted): ReactNode {
  return (
    <box flexDirection="row" gap={1}>
      <text content={label} fg={colors.textDim} />
      <text content={value} fg={valueColor} />
    </box>
  );
}

export function KeyHint(key: string, description: string): ReactNode {
  return (
    <box flexDirection="row" gap={1}>
      <text content={`[${key}]`} fg={colors.text} />
      <text content={description} fg={colors.textDim} />
    </box>
  );
}

export function KeyHintsRow(...hints: { key: string; description: string }[]): ReactNode {
  return (
    <box flexDirection="row" gap={3} justifyContent="center">
      {hints.map(({ key, description }) => (
        <box key={`${key}-${description}`} flexDirection="row" gap={1}>
          <text content={`[${key}]`} fg={colors.text} />
          <text content={description} fg={colors.textDim} />
        </box>
      ))}
    </box>
  );
}

export function TimerDisplay(time: string, status: 'running' | 'paused' | 'stopped' = 'running'): ReactNode {
  const timerColor = status === 'running' ? colors.text : colors.textMuted;
  return (
    <box flexDirection="column" alignItems="center" justifyContent="center">
      <ascii-font text={time} font="block" color={timerColor} />
    </box>
  );
}

export function MessageBox(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): ReactNode {
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

  return (
    <box flexDirection="row" gap={1} padding={1} borderStyle="rounded" borderColor={colors.border} border>
      <text content={typeIcons[type]} fg={typeColors[type]} />
      <text content={message} fg={colors.text} />
    </box>
  );
}

export function LoadingText(message: string): ReactNode {
  return (
    <box flexDirection="row" gap={1}>
      <text content="..." fg={colors.textMuted} />
      <text content={message} fg={colors.textDim} />
    </box>
  );
}

export function Spinner({ frameIndex }: { frameIndex: number }): ReactNode {
  const activeIndex = frameIndex % 3;
  const dots = [0, 1, 2];

  return (
    <box flexDirection="row" gap={2} alignItems="center">
      {dots.map((i) => (
        <box key={i} flexDirection="column">
          <text content="███" fg={i === activeIndex ? colors.text : colors.textDim} />
          <text content="███" fg={i === activeIndex ? colors.text : colors.textDim} />
        </box>
      ))}
    </box>
  );
}

export function Divider(width: number = 40): ReactNode {
  return <text content={'-'.repeat(width)} fg={colors.border} />;
}

export function IssueDisplay(issueKey: string, summary: string, status: string): ReactNode {
  return (
    <box flexDirection="column" gap={0}>
      <box flexDirection="row" gap={1}>
        <text content={issueKey} fg={colors.text} />
        <text content={summary} fg={colors.textMuted} />
      </box>
      <box flexDirection="row" gap={1} marginLeft={2}>
        <text content="status" fg={colors.textDim} />
        <text content={status} fg={colors.textMuted} />
      </box>
    </box>
  );
}
