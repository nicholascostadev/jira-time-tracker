import { describe, it, expect } from 'vitest';
import {
  getDefaultWorklogMode,
  buildWorklogsToPost,
  countRoundedEntries,
} from './worklog-review.js';

describe('worklog-review helpers', () => {
  describe('getDefaultWorklogMode', () => {
    it('defaults to single for one segment', () => {
      expect(getDefaultWorklogMode([
        { startedAt: 1000, endedAt: 4000, durationSeconds: 3 },
      ])).toBe('single');
    });

    it('defaults to single for no segments', () => {
      expect(getDefaultWorklogMode([])).toBe('single');
    });

    it('defaults to split for multiple segments', () => {
      expect(getDefaultWorklogMode([
        { startedAt: 1000, endedAt: 4000, durationSeconds: 3 },
        { startedAt: 5000, endedAt: 11000, durationSeconds: 6 },
      ])).toBe('split');
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
          { startedAt: 1000, endedAt: 4000, durationSeconds: 3 },
          { startedAt: 5000, endedAt: 11000, durationSeconds: 6 },
        ],
        9,
        1000
      );

      expect(entries).toEqual([
        { startedAt: 1000, durationSeconds: 3 },
        { startedAt: 5000, durationSeconds: 6 },
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
