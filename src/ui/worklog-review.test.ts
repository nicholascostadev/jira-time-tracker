import { describe, it, expect } from 'vitest';
import {
  canSplitWorklogEntries,
  getDefaultWorklogMode,
  buildWorklogsToPost,
  countRoundedEntries,
} from './worklog-review.js';

describe('worklog-review helpers', () => {
  describe('canSplitWorklogEntries', () => {
    it('returns true for multiple segments with at least one minute total', () => {
      expect(canSplitWorklogEntries([
        { startedAt: 1000, endedAt: 31000, durationSeconds: 30 },
        { startedAt: 61000, endedAt: 91000, durationSeconds: 30 },
      ], 60)).toBe(true);
    });

    it('returns false when total elapsed is under one minute', () => {
      expect(canSplitWorklogEntries([
        { startedAt: 1000, endedAt: 20000, durationSeconds: 19 },
        { startedAt: 30000, endedAt: 50000, durationSeconds: 20 },
      ], 39)).toBe(false);
    });

    it('returns false for a single segment', () => {
      expect(canSplitWorklogEntries([
        { startedAt: 1000, endedAt: 4000, durationSeconds: 3 },
      ], 3)).toBe(false);
    });
  });

  describe('getDefaultWorklogMode', () => {
    it('defaults to single for one segment', () => {
      expect(getDefaultWorklogMode([
        { startedAt: 1000, endedAt: 4000, durationSeconds: 3 },
      ], 3)).toBe('single');
    });

    it('defaults to single for no segments', () => {
      expect(getDefaultWorklogMode([], 0)).toBe('single');
    });

    it('defaults to split for multiple segments', () => {
      expect(getDefaultWorklogMode([
        { startedAt: 1000, endedAt: 4000, durationSeconds: 3 },
        { startedAt: 5000, endedAt: 11000, durationSeconds: 6 },
      ], 60)).toBe('split');
    });

    it('defaults to single when multiple segments total under one minute', () => {
      expect(getDefaultWorklogMode([
        { startedAt: 1000, endedAt: 20000, durationSeconds: 19 },
        { startedAt: 30000, endedAt: 50000, durationSeconds: 20 },
      ], 39)).toBe('single');
    });
  });

  describe('buildWorklogsToPost', () => {
    it('builds one single entry when mode is single', () => {
      const entries = buildWorklogsToPost(
        'single',
        [
          { startedAt: 1000, endedAt: 4000, durationSeconds: 3 },
          { startedAt: 5000, endedAt: 11000, durationSeconds: 6 },
        ],
        9,
        1000
      );

      expect(entries).toEqual([{ startedAt: 1000, durationSeconds: 9 }]);
    });

    it('builds split entries when mode is split and there are many segments', () => {
      const entries = buildWorklogsToPost(
        'split',
        [
          { startedAt: 1000, endedAt: 31000, durationSeconds: 30 },
          { startedAt: 5000, endedAt: 65000, durationSeconds: 60 },
        ],
        90,
        1000
      );

      expect(entries).toEqual([
        { startedAt: 1000, durationSeconds: 30 },
        { startedAt: 5000, durationSeconds: 60 },
      ]);
    });

    it('falls back to single entry when split selected but only one segment exists', () => {
      const entries = buildWorklogsToPost(
        'split',
        [{ startedAt: 1000, endedAt: 4000, durationSeconds: 3 }],
        3,
        1000
      );

      expect(entries).toEqual([{ startedAt: 1000, durationSeconds: 3 }]);
    });

    it('falls back to single entry when split selected but total is under one minute', () => {
      const entries = buildWorklogsToPost(
        'split',
        [
          { startedAt: 1000, endedAt: 20000, durationSeconds: 19 },
          { startedAt: 30000, endedAt: 50000, durationSeconds: 20 },
        ],
        39,
        1000
      );

      expect(entries).toEqual([{ startedAt: 1000, durationSeconds: 39 }]);
    });

    it('uses fallback start when no segment exists', () => {
      const entries = buildWorklogsToPost('single', [], 120, 9000);
      expect(entries).toEqual([{ startedAt: 9000, durationSeconds: 120 }]);
    });
  });

  describe('countRoundedEntries', () => {
    it('counts entries under 60 seconds', () => {
      expect(countRoundedEntries([
        { startedAt: 1000, durationSeconds: 59 },
        { startedAt: 2000, durationSeconds: 60 },
        { startedAt: 3000, durationSeconds: 10 },
      ])).toBe(2);
    });

    it('returns zero when no entries are rounded', () => {
      expect(countRoundedEntries([
        { startedAt: 1000, durationSeconds: 60 },
        { startedAt: 2000, durationSeconds: 120 },
      ])).toBe(0);
    });
  });
});
