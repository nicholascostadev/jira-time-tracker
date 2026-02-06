import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod/v4';
import { FailedWorklogSchema } from '../types/index.js';

const FailedWorklogArraySchema = z.array(FailedWorklogSchema);

let mockStore: Record<string, unknown> = {};

vi.mock('conf', () => {
  return {
    default: class MockConf {
      path = '/mock/path/config.json';

      get(key: string) {
        return mockStore[key] ?? '';
      }

      set(key: string, value: unknown) {
        mockStore[key] = value;
      }

      delete(key: string) {
        delete mockStore[key];
      }
    },
  };
});

const {
  getJiraConfig,
  setJiraConfig,
  clearJiraConfig,
  isConfigured,
  getActiveTimer,
  setActiveTimer,
  clearActiveTimer,
  getConfigPath,
  maskApiToken,
  getFailedWorklogs,
  addFailedWorklog,
  removeFailedWorklog,
  clearFailedWorklogs,
  getDefaultWorklogMessage,
  setDefaultWorklogMessage,
} = await import('./config.js');

describe('Config Service', () => {
  beforeEach(() => {
    mockStore = {};
  });

  describe('jira config', () => {
    it('returns null when not configured', () => {
      expect(getJiraConfig()).toBeNull();
    });

    it('returns api-token config when fully configured', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'api-token-123',
      };

      expect(getJiraConfig()).toEqual({
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'api-token',
          email: 'test@example.com',
          apiToken: 'api-token-123',
        },
      });
    });

    it('writes api-token config', () => {
      setJiraConfig({
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'api-token',
          email: 'test@example.com',
          apiToken: 'api-token-123',
        },
      });

      expect(mockStore.jiraHost).toBe('https://test.atlassian.net');
      expect(mockStore.email).toBe('test@example.com');
      expect(mockStore.apiToken).toBe('api-token-123');
    });

    it('clears jira config values', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'api-token-123',
      };

      clearJiraConfig();

      expect(mockStore.jiraHost).toBeUndefined();
      expect(mockStore.email).toBeUndefined();
      expect(mockStore.apiToken).toBeUndefined();
    });

    it('isConfigured true when api token is set', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'api-token-123',
      };

      expect(isConfigured()).toBe(true);
    });
  });

  describe('active timer', () => {
    it('returns null when no active timer', () => {
      expect(getActiveTimer()).toBeNull();
    });

    it('sets and returns active timer', () => {
      const timerState = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: Date.now(),
        pausedAt: null,
        totalPausedTime: 0,
        intervals: [{ startedAt: Date.now(), endedAt: null }],
        isPaused: false,
        isRunning: true,
      };

      setActiveTimer(timerState);
      expect(getActiveTimer()).toEqual(timerState);
    });

    it('clears active timer', () => {
      mockStore.activeTimer = { issueKey: 'TEST-123' };
      clearActiveTimer();
      expect(mockStore.activeTimer).toBeNull();
    });
  });

  describe('misc', () => {
    it('returns config path', () => {
      expect(getConfigPath()).toBe('/mock/path/config.json');
    });

    it('masks api token', () => {
      expect(maskApiToken('abcd1234efgh5678')).toBe('abcd****5678');
      expect(maskApiToken('short')).toBe('****');
    });
  });

  describe('default worklog message', () => {
    it('returns empty string by default', () => {
      expect(getDefaultWorklogMessage()).toBe('');
    });

    it('sets and returns default worklog message', () => {
      setDefaultWorklogMessage('Working on feature');
      expect(getDefaultWorklogMessage()).toBe('Working on feature');
    });

    it('clears default worklog message when set to empty string', () => {
      setDefaultWorklogMessage('Some message');
      expect(getDefaultWorklogMessage()).toBe('Some message');

      setDefaultWorklogMessage('');
      expect(getDefaultWorklogMessage()).toBe('');
    });
  });

  describe('failed worklog queue', () => {
    it('returns empty array by default', () => {
      expect(getFailedWorklogs()).toEqual([]);
    });

    it('adds and removes worklogs', () => {
      mockStore.failedWorklogs = [];

      const worklog = {
        issueKey: 'TEST-1',
        timeSpentSeconds: 3600,
        comment: 'Work',
        started: '2024-01-15T10:00:00.000Z',
        failedAt: 1700000000000,
        error: 'Network error',
      };

      addFailedWorklog(worklog);
      expect(FailedWorklogArraySchema.parse(mockStore.failedWorklogs)).toEqual([worklog]);

      removeFailedWorklog(0);
      expect(FailedWorklogArraySchema.parse(mockStore.failedWorklogs)).toEqual([]);
    });

    it('clears queue', () => {
      mockStore.failedWorklogs = [
        {
          issueKey: 'TEST-1',
          timeSpentSeconds: 3600,
          comment: 'Work',
          started: '2024-01-15T10:00:00.000Z',
          failedAt: 1700000000000,
          error: 'Error',
        },
      ];

      clearFailedWorklogs();
      expect(mockStore.failedWorklogs).toEqual([]);
    });
  });
});
