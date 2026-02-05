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
  textMuted: '#71717A',    // Zinc-500 - muted text
  textDim: '#52525B',      // Zinc-600 - dimmed text
  
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
  selectedFg: '#000000',
  selectedBg: colors.text,
  descriptionFg: colors.textMuted,
} as const;

// Input component styles
export const inputStyles = {
  focusedBorderColor: colors.borderFocused,
  focusedBackgroundColor: colors.bgHighlight,
  placeholderFg: colors.textDim,
} as const;
