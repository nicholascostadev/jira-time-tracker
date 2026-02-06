import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FailedWorklog } from '../types/index.js';

// Mock config service
const mockGetFailedWorklogs = vi.fn();
const mockRemoveFailedWorklog = vi.fn();

vi.mock('./config.js', () => ({
  getFailedWorklogs: (...args: unknown[]) => mockGetFailedWorklogs(...args),
  removeFailedWorklog: (...args: unknown[]) => mockRemoveFailedWorklog(...args),
}));

// Mock jira service
const mockAddWorklog = vi.fn();

vi.mock('./jira.js', () => ({
  addWorklog: (...args: unknown[]) => mockAddWorklog(...args),
}));

const { retryFailedWorklogs } = await import('./worklog-queue.js');

function createFailedWorklog(overrides?: Partial<FailedWorklog>): FailedWorklog {
  return {
    issueKey: 'TEST-123',
    timeSpentSeconds: 3600,
    comment: 'Working on feature',
    started: '2024-01-15T10:00:00.000Z',
    failedAt: Date.now(),
    error: 'Network error',
    ...overrides,
  };
}

describe('Worklog Queue Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('retryFailedWorklogs', () => {
    it('should return zeros when queue is empty', async () => {
      mockGetFailedWorklogs.mockReturnValue([]);

      const result = await retryFailedWorklogs();

      expect(result).toEqual({ total: 0, succeeded: 0, failed: 0 });
      expect(mockAddWorklog).not.toHaveBeenCalled();
    });

    it('should retry all worklogs and remove succeeded ones', async () => {
      const worklogs = [
        createFailedWorklog({ issueKey: 'TEST-1' }),
        createFailedWorklog({ issueKey: 'TEST-2' }),
      ];
      mockGetFailedWorklogs.mockReturnValue(worklogs);
      mockAddWorklog.mockResolvedValue({ id: 'wl-1' });

      const result = await retryFailedWorklogs();

      expect(result).toEqual({ total: 2, succeeded: 2, failed: 0 });
      expect(mockAddWorklog).toHaveBeenCalledTimes(2);
      expect(mockRemoveFailedWorklog).toHaveBeenCalledTimes(2);
    });

    it('should count failures when worklog posting fails again', async () => {
      const worklogs = [
        createFailedWorklog({ issueKey: 'TEST-1' }),
        createFailedWorklog({ issueKey: 'TEST-2' }),
      ];
      mockGetFailedWorklogs.mockReturnValue(worklogs);
      mockAddWorklog.mockRejectedValue(new Error('Still failing'));

      const result = await retryFailedWorklogs();

      expect(result).toEqual({ total: 2, succeeded: 0, failed: 2 });
      expect(mockRemoveFailedWorklog).not.toHaveBeenCalled();
    });

    it('should handle mixed success and failure', async () => {
      const worklogs = [
        createFailedWorklog({ issueKey: 'TEST-1' }),
        createFailedWorklog({ issueKey: 'TEST-2' }),
        createFailedWorklog({ issueKey: 'TEST-3' }),
      ];
      mockGetFailedWorklogs.mockReturnValue(worklogs);

      // Process in reverse order: TEST-3 succeeds, TEST-2 fails, TEST-1 succeeds
      mockAddWorklog
        .mockResolvedValueOnce({ id: 'wl-3' }) // TEST-3 (index 2, processed first)
        .mockRejectedValueOnce(new Error('fail'))  // TEST-2 (index 1)
        .mockResolvedValueOnce({ id: 'wl-1' }); // TEST-1 (index 0)

      const result = await retryFailedWorklogs();

      expect(result).toEqual({ total: 3, succeeded: 2, failed: 1 });
      expect(mockRemoveFailedWorklog).toHaveBeenCalledTimes(2);
    });

    it('should pass correct arguments to addWorklog', async () => {
      const worklog = createFailedWorklog({
        issueKey: 'PROJ-42',
        timeSpentSeconds: 1800,
        comment: 'Bug fix',
        started: '2024-06-01T09:00:00.000Z',
      });
      mockGetFailedWorklogs.mockReturnValue([worklog]);
      mockAddWorklog.mockResolvedValue({ id: 'wl-1' });

      await retryFailedWorklogs();

      expect(mockAddWorklog).toHaveBeenCalledWith(
        'PROJ-42',
        1800,
        'Bug fix',
        new Date('2024-06-01T09:00:00.000Z')
      );
    });

    it('should process worklogs in reverse order for safe index removal', async () => {
      const worklogs = [
        createFailedWorklog({ issueKey: 'TEST-1' }),
        createFailedWorklog({ issueKey: 'TEST-2' }),
        createFailedWorklog({ issueKey: 'TEST-3' }),
      ];
      mockGetFailedWorklogs.mockReturnValue(worklogs);
      mockAddWorklog.mockResolvedValue({ id: 'wl-1' });

      await retryFailedWorklogs();

      // Should remove in reverse order: index 2, then 1, then 0
      const removeCallIndices = mockRemoveFailedWorklog.mock.calls.map(
        (call: unknown[]) => call[0]
      );
      expect(removeCallIndices).toEqual([2, 1, 0]);
    });
  });
});
