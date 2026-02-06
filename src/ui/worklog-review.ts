import type { WorklogSegment } from '../types/index.js';

export type WorklogMode = 'single' | 'split';

export interface WorklogEntry {
  startedAt: number;
  durationSeconds: number;
}

export function canSplitWorklogEntries(segments: WorklogSegment[], elapsedSeconds: number): boolean {
  return segments.length > 1 && elapsedSeconds >= 60;
}

export function getDefaultWorklogMode(
  segments: WorklogSegment[],
  elapsedSeconds: number
): WorklogMode {
  return canSplitWorklogEntries(segments, elapsedSeconds) ? 'split' : 'single';
}

export function buildWorklogsToPost(
  mode: WorklogMode,
  segments: WorklogSegment[],
  elapsedSeconds: number,
  fallbackStartedAt: number
): WorklogEntry[] {
  if (mode === 'split' && canSplitWorklogEntries(segments, elapsedSeconds)) {
    return segments.map((segment) => ({
      startedAt: segment.startedAt,
      durationSeconds: segment.durationSeconds,
    }));
  }

  return [{
    startedAt: segments[0]?.startedAt ?? fallbackStartedAt,
    durationSeconds: elapsedSeconds,
  }];
}

export function countRoundedEntries(entries: WorklogEntry[]): number {
  return entries.filter((entry) => entry.durationSeconds < 60).length;
}
