import type { TimerState } from '../types/index.js';
import { getActiveTimer, setActiveTimer, clearActiveTimer } from './config.js';

export function createTimer(issueKey: string, description: string): TimerState {
  const timer: TimerState = {
    issueKey,
    description,
    startedAt: Date.now(),
    pausedAt: null,
    totalPausedTime: 0,
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

  timer.isPaused = true;
  timer.pausedAt = Date.now();
  setActiveTimer(timer);
  return timer;
}

export function resumeTimer(): TimerState | null {
  const timer = getActiveTimer();
  if (!timer || !timer.isRunning || !timer.isPaused || timer.pausedAt === null) {
    return null;
  }

  timer.totalPausedTime += Date.now() - timer.pausedAt;
  timer.pausedAt = null;
  timer.isPaused = false;
  setActiveTimer(timer);
  return timer;
}

export function stopTimer(): TimerState | null {
  const timer = getActiveTimer();
  if (!timer || !timer.isRunning) {
    return null;
  }

  // If paused, add the final pause duration
  if (timer.isPaused && timer.pausedAt !== null) {
    timer.totalPausedTime += Date.now() - timer.pausedAt;
  }

  timer.isRunning = false;
  timer.isPaused = false;
  clearActiveTimer();
  return timer;
}

export function getElapsedSeconds(timer: TimerState): number {
  const now = Date.now();
  let elapsed = now - timer.startedAt - timer.totalPausedTime;

  // If currently paused, subtract the current pause duration
  if (timer.isPaused && timer.pausedAt !== null) {
    elapsed -= now - timer.pausedAt;
  }

  return Math.floor(elapsed / 1000);
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
