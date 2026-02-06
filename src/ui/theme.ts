// Theme colors for the Jira Time Tracker CLI
// Opencode/Vercel-style dark theme - minimal black/gray/white

export const colors = {
  // Background - true black
  bg: '#000000',           // Pure black background
  
  // Primary colors - subtle white/gray accents
  primary: '#FFFFFF',      // White - main accent
  secondary: '#A1A1A1',    // Gray - secondary accent
  
  // Status colors - muted, minimal
  success: '#22C55E',      // Green (only for success states)
  warning: '#EAB308',      // Yellow (only for warnings)
  error: '#EF4444',        // Red (only for errors)
  info: '#A1A1A1',         // Gray for info
  
  // Neutral colors - the main palette
  text: '#FAFAFA',         // Near white for main text
  textLabel: '#D4D4D8',    // Zinc-300 - labels (ISSUE:, STATUS:, etc.)
  textMuted: '#A1A1AA',    // Zinc-400 - muted text
  textDim: '#71717A',      // Zinc-500 - dimmed text
  
  // Background colors
  bgHighlight: '#18181B',  // Zinc-900 - slightly lighter
  bgSelected: '#27272A',   // Zinc-800 - selected items
  
  // Border colors
  border: '#27272A',       // Zinc-800 - subtle borders
  borderFocused: '#52525B', // Zinc-600 - focused border
  borderActive: '#71717A',  // Zinc-500 - active border
  
  // Timer specific - using the minimal palette
  timerRunning: '#22C55E', // Green when running
  timerPaused: '#EAB308',  // Yellow when paused
  timerStopped: '#71717A', // Gray when stopped
} as const;

// Keyboard shortcut styling
export const keyStyle = {
  fg: '#000000',
  bg: colors.text,
} as const;

// Box styles for different contexts
export const boxStyles = {
  panel: {
    borderStyle: 'rounded' as const,
    borderColor: colors.border,
    padding: 1,
  },
  focused: {
    borderStyle: 'rounded' as const,
    borderColor: colors.borderFocused,
    padding: 1,
  },
  active: {
    borderStyle: 'rounded' as const,
    borderColor: colors.borderActive,
    padding: 1,
  },
} as const;

// Select component styles
export const selectStyles = {
  bg: colors.bg,
  fg: colors.text,
  focusedBg: colors.bg,
  focusedFg: colors.text,
  selectedBg: colors.text,
  selectedFg: colors.bg,
  descriptionFg: colors.textDim,
  selectedDescriptionFg: colors.bgHighlight,
} as const;

// Input component styles
export const inputStyles = {
  focusedBorderColor: colors.borderFocused,
  focusedBackgroundColor: colors.bgHighlight,
  placeholderFg: colors.textDim,
} as const;

// Status color mapping - background colors for status badges
// Uses muted/dark variants so they look good on a dark background
const statusColorMap: Record<string, { bg: string; fg: string }> = {
  'to do':              { bg: '#3F3F46', fg: '#D4D4D8' },  // Zinc - neutral
  'in progress':        { bg: '#1E3A5F', fg: '#60A5FA' },  // Blue
  'failed':             { bg: '#5C1D1D', fg: '#F87171' },  // Red
  'on hold':            { bg: '#4A3728', fg: '#FBBF24' },  // Amber
  'testing':            { bg: '#3B1F5E', fg: '#C084FC' },  // Purple
  'qa':                 { bg: '#164E63', fg: '#22D3EE' },  // Cyan
  'qa/in progress':     { bg: '#1E3A5F', fg: '#60A5FA' },  // Blue
  'qa/pre-prod':        { bg: '#134E4A', fg: '#2DD4BF' },  // Teal
  'qa/pre-prod/done':   { bg: '#14532D', fg: '#4ADE80' },  // Green
  'done':               { bg: '#14532D', fg: '#4ADE80' },  // Green
};

const fallbackStatusColors = [
  { bg: '#3F2D5E', fg: '#A78BFA' },  // Violet
  { bg: '#4A2D1B', fg: '#FB923C' },  // Orange
  { bg: '#1E3A2E', fg: '#34D399' },  // Emerald
  { bg: '#3B1F3F', fg: '#F0ABFC' },  // Fuchsia
  { bg: '#1E293B', fg: '#94A3B8' },  // Slate
];

// Track assigned fallback colors for unknown statuses
const assignedFallbacks = new Map<string, { bg: string; fg: string }>();
let fallbackIndex = 0;

/**
 * Returns background and foreground colors for a Jira status.
 * Known statuses get a predefined color; unknown ones get a consistent
 * dynamically assigned color from the fallback palette.
 */
export function getStatusColors(status: string): { bg: string; fg: string } {
  const key = status.toLowerCase();
  if (statusColorMap[key]) {
    return statusColorMap[key];
  }

  if (!assignedFallbacks.has(key)) {
    assignedFallbacks.set(key, fallbackStatusColors[fallbackIndex % fallbackStatusColors.length]);
    fallbackIndex++;
  }

  return assignedFallbacks.get(key)!;
}

/**
 * Returns true if a status represents a "done" state and should be
 * hidden from the active issue list.
 */
export function isDoneStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'done' || s.endsWith('/done');
}
