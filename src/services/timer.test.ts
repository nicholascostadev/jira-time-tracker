import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  getElapsedSeconds,
  getWorklogSegments,
  formatTime,
  formatTimeHumanReadable,
  getCurrentTimer,
  hasActiveTimer,
} from './timer.js';
import * as configService from './config.js';

// Mock the config service
vi.mock('./config.js', () => ({
  getActiveTimer: vi.fn(),
  setActiveTimer: vi.fn(),
  clearActiveTimer: vi.fn(),
}));

describe('Timer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createTimer', () => {
    it('should create a new timer with correct properties', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const timer = createTimer('TEST-123', 'Working on feature');

      expect(timer).toEqual({
        issueKey: 'TEST-123',
        description: 'Working on feature',
        startedAt: now,
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: now, endedAt: null }],
        isPaused: false,
        isRunning: true,
      });

      expect(configService.setActiveTimer).toHaveBeenCalledWith(timer);
    });
  });

  describe('pauseTimer', () => {
    it('should pause a running timer', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: now - 60000, // Started 1 minute ago
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: now - 60000, endedAt: null }],
        isPaused: false,
        isRunning: true,
      };

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      const result = pauseTimer();

      expect(result).not.toBeNull();
      expect(result?.isPaused).toBe(true);
      expect(result?.pausedAt).toBe(now);
      expect(result?.intervals).toEqual([{ startedAt: now - 60000, endedAt: now }]);
    });

    it('should return null if no active timer', () => {
      vi.mocked(configService.getActiveTimer).mockReturnValue(null);

      const result = pauseTimer();

      expect(result).toBeNull();
    });

    it('should return null if timer already paused', () => {
      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: Date.now() - 60000,
        pausedAt: Date.now(),
        totalPausedTime: 0,
        intervals: [{ startedAt: Date.now() - 60000, endedAt: Date.now() }],
        isPaused: true,
        isRunning: true,
      };

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      const result = pauseTimer();

      expect(result).toBeNull();
    });
  });

  describe('resumeTimer', () => {
    it('should resume a paused timer and calculate paused time', () => {
      const startTime = 1000000;
      const pauseTime = 1060000; // Paused 60 seconds after start
      const resumeTime = 1090000; // Resume 30 seconds after pause

      vi.setSystemTime(resumeTime);

      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: startTime,
        pausedAt: pauseTime,
        totalPausedTime: 0,
        intervals: [{ startedAt: startTime, endedAt: pauseTime }],
        isPaused: true,
        isRunning: true,
      };

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      const result = resumeTimer();

      expect(result).not.toBeNull();
      expect(result?.isPaused).toBe(false);
      expect(result?.pausedAt).toBeNull();
      expect(result?.totalPausedTime).toBe(30000); // 30 seconds paused
      expect(result?.intervals).toEqual([
        { startedAt: startTime, endedAt: pauseTime },
        { startedAt: resumeTime, endedAt: null },
      ]);
    });

    it('should return null if timer not paused', () => {
      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: Date.now() - 60000,
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: Date.now() - 60000, endedAt: null }],
        isPaused: false,
        isRunning: true,
      };

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      const result = resumeTimer();

      expect(result).toBeNull();
    });
  });

  describe('stopTimer', () => {
    it('should stop a running timer', () => {
      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: 940000,
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: 940000, endedAt: null }],
        isPaused: false,
        isRunning: true,
      };

      vi.setSystemTime(1000000);

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      const result = stopTimer();

      expect(result).not.toBeNull();
      expect(result?.isRunning).toBe(false);
      expect(result?.intervals).toEqual([{ startedAt: 940000, endedAt: 1000000 }]);
      expect(configService.clearActiveTimer).toHaveBeenCalled();
    });

    it('should add final pause duration when stopping a paused timer', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: now - 120000, // 2 minutes ago
        pausedAt: now - 30000, // Paused 30 seconds ago
        totalPausedTime: 10000, // Already 10 seconds paused before
        intervals: [{ startedAt: now - 120000, endedAt: now - 30000 }],
        isPaused: true,
        isRunning: true,
      };

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      const result = stopTimer();

      expect(result?.totalPausedTime).toBe(40000); // 10s + 30s = 40s
    });

    it('should return null if no active timer', () => {
      vi.mocked(configService.getActiveTimer).mockReturnValue(null);

      const result = stopTimer();

      expect(result).toBeNull();
    });
  });

  describe('getElapsedSeconds', () => {
    it('should calculate elapsed time correctly for running timer', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const timer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: now - 120000, // 2 minutes ago
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: now - 120000, endedAt: null }],
        isPaused: false,
        isRunning: true,
      };

      expect(getElapsedSeconds(timer)).toBe(120);
    });

    it('should subtract paused time from elapsed', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const timer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: now - 120000, // 2 minutes ago
        pausedAt: null,
        totalPausedTime: 30000, // 30 seconds paused
        intervals: [{ startedAt: now - 120000, endedAt: null }],
        isPaused: false,
        isRunning: true,
      };

      expect(getElapsedSeconds(timer)).toBe(90); // 120 - 30 = 90
    });

    it('should handle currently paused timer', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const timer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: now - 120000, // 2 minutes ago
        pausedAt: now - 20000, // Paused 20 seconds ago
        totalPausedTime: 10000, // 10 seconds previously paused
        intervals: [{ startedAt: now - 120000, endedAt: now - 20000 }],
        isPaused: true,
        isRunning: true,
      };

      // 120 - 10 (prev paused) - 20 (current pause) = 90
      expect(getElapsedSeconds(timer)).toBe(90);
    });
  });

  describe('formatTime', () => {
    it('should format seconds correctly', () => {
      expect(formatTime(0)).toBe('00:00:00');
      expect(formatTime(59)).toBe('00:00:59');
      expect(formatTime(60)).toBe('00:01:00');
      expect(formatTime(3661)).toBe('01:01:01');
      expect(formatTime(36000)).toBe('10:00:00');
    });
  });

  describe('getWorklogSegments', () => {
    it('returns closed intervals as worklog segments', () => {
      const timer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: 1000000,
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [
          { startedAt: 1000000, endedAt: 1300000 },
          { startedAt: 1600000, endedAt: 2200000 },
        ],
        isPaused: false,
        isRunning: false,
      };

      expect(getWorklogSegments(timer)).toEqual([
        { startedAt: 1000000, endedAt: 1300000, durationSeconds: 300 },
        { startedAt: 1600000, endedAt: 2200000, durationSeconds: 600 },
      ]);
    });

    it('excludes zero-length intervals', () => {
      const timer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: 1000000,
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: 1000000, endedAt: 1000000 }],
        isPaused: false,
        isRunning: false,
      };

      expect(getWorklogSegments(timer)).toEqual([]);
    });

    it('creates a segment from legacy paused timer without intervals', () => {
      const timer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: 1000000,
        pausedAt: 1300000,
        totalPausedTime: 0,
        isPaused: true,
        isRunning: true,
      };

      expect(getWorklogSegments(timer as any)).toEqual([
        { startedAt: 1000000, endedAt: 1300000, durationSeconds: 300 },
      ]);
    });

    it('returns no segments for legacy running timer without intervals', () => {
      const timer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: 1000000,
        pausedAt: null,
        totalPausedTime: 0,
        isPaused: false,
        isRunning: true,
      };

      expect(getWorklogSegments(timer as any)).toEqual([]);
    });
  });

  describe('formatTimeHumanReadable', () => {
    it('should format time in human readable format', () => {
      expect(formatTimeHumanReadable(0)).toBe('less than 1m');
      expect(formatTimeHumanReadable(59)).toBe('less than 1m');
      expect(formatTimeHumanReadable(60)).toBe('1m');
      expect(formatTimeHumanReadable(3600)).toBe('1h');
      expect(formatTimeHumanReadable(3660)).toBe('1h 1m');
      expect(formatTimeHumanReadable(7200)).toBe('2h');
      expect(formatTimeHumanReadable(5400)).toBe('1h 30m');
    });
  });

  describe('getCurrentTimer', () => {
    it('should return the current timer from config', () => {
      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: Date.now(),
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: Date.now(), endedAt: null }],
        isPaused: false,
        isRunning: true,
      };

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      expect(getCurrentTimer()).toEqual(mockTimer);
    });
  });

  describe('hasActiveTimer', () => {
    it('should return true when there is an active running timer', () => {
      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: Date.now(),
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: Date.now(), endedAt: null }],
        isPaused: false,
        isRunning: true,
      };

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      expect(hasActiveTimer()).toBe(true);
    });

    it('should return false when there is no timer', () => {
      vi.mocked(configService.getActiveTimer).mockReturnValue(null);

      expect(hasActiveTimer()).toBe(false);
    });

    it('should return false when timer is not running', () => {
      const mockTimer = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: Date.now(),
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: Date.now(), endedAt: null }],
        isPaused: false,
        isRunning: false,
      };

      vi.mocked(configService.getActiveTimer).mockReturnValue(mockTimer);

      expect(hasActiveTimer()).toBe(false);
    });
  });
});
