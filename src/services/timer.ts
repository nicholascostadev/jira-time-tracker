import type { TimerState, TimerInterval, WorklogSegment } from '../types/index.js';
import { getActiveTimer, setActiveTimer, clearActiveTimer } from './config.js';

function ensureIntervals(timer: TimerState): TimerInterval[] {
  if (Array.isArray(timer.intervals) && timer.intervals.length > 0) {
    return timer.intervals;
  }

  if (timer.isPaused) {
    return [{
      startedAt: timer.startedAt,
      endedAt: timer.pausedAt ?? timer.startedAt,
    }];
  }

  return [{
    startedAt: timer.startedAt,
    endedAt: null,
  }];
}

function getOpenInterval(timer: TimerState): TimerInterval | null {
  const intervals = ensureIntervals(timer);
  const lastInterval = intervals[intervals.length - 1];
  if (!lastInterval || lastInterval.endedAt !== null) {
    return null;
  }
  return lastInterval;
}

function closeOpenInterval(timer: TimerState, endedAt: number): void {
  const openInterval = getOpenInterval(timer);
  if (openInterval) {
    openInterval.endedAt = endedAt;
  }
}

export function createTimer(issueKey: string, description: string): TimerState {
  const now = Date.now();
  const timer: TimerState = {
    issueKey,
    description,
    startedAt: now,
    pausedAt: null,
    totalPausedTime: 0,
    intervals: [{ startedAt: now, endedAt: null }],
    isPaused: false,
    isRunning: true,
  };

  setActiveTimer(timer);
  return timer;
}

export function pauseTimer(): TimerState | null {
  const timer = getActiveTimer();
  if (!timer || !timer.isRunning || timer.isPaused) {
    return null;
  }

  const now = Date.now();
  timer.intervals = ensureIntervals(timer);
  timer.isPaused = true;
  timer.pausedAt = now;
  closeOpenInterval(timer, now);
  setActiveTimer(timer);
  return timer;
}

export function resumeTimer(): TimerState | null {
  const timer = getActiveTimer();
  if (!timer || !timer.isRunning || !timer.isPaused || timer.pausedAt === null) {
    return null;
  }

  const now = Date.now();
  timer.intervals = ensureIntervals(timer);
  timer.totalPausedTime += now - timer.pausedAt;
  timer.pausedAt = null;
  timer.isPaused = false;
  timer.intervals.push({ startedAt: now, endedAt: null });
  setActiveTimer(timer);
  return timer;
}

export function stopTimer(): TimerState | null {
  const timer = getActiveTimer();
  if (!timer || !timer.isRunning) {
    return null;
  }

  const now = Date.now();
  timer.intervals = ensureIntervals(timer);

  // If paused, add the final pause duration
  if (timer.isPaused && timer.pausedAt !== null) {
    timer.totalPausedTime += now - timer.pausedAt;
  } else {
    closeOpenInterval(timer, now);
  }

  timer.isRunning = false;
  timer.isPaused = false;
  clearActiveTimer();
  return timer;
}

export function getElapsedSeconds(timer: TimerState): number {
  timer.intervals = ensureIntervals(timer);
  const now = Date.now();
  let elapsed = now - timer.startedAt - timer.totalPausedTime;

  // If currently paused, subtract the current pause duration
  if (timer.isPaused && timer.pausedAt !== null) {
    elapsed -= now - timer.pausedAt;
  }

  return Math.floor(elapsed / 1000);
}

export function getWorklogSegments(timer: TimerState): WorklogSegment[] {
  timer.intervals = ensureIntervals(timer);

  return timer.intervals
    .filter((interval) => interval.endedAt !== null)
    .map((interval) => {
      const endedAt = interval.endedAt as number;
      return {
        startedAt: interval.startedAt,
        endedAt,
        durationSeconds: Math.floor((endedAt - interval.startedAt) / 1000),
      };
    })
    .filter((segment) => segment.durationSeconds > 0);
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
  ].join(':');
}

export function formatTimeHumanReadable(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (parts.length === 0) {
    return 'less than 1m';
  }

  return parts.join(' ');
}

export function getCurrentTimer(): TimerState | null {
  return getActiveTimer();
}

export function hasActiveTimer(): boolean {
  const timer = getActiveTimer();
  return timer !== null && timer.isRunning;
}
