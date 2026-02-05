import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mock store to hold values
let mockStore: Record<string, unknown> = {};

// Mock Conf class
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

// Import after mocking
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
  isOAuthTokenExpired,
  updateOAuthTokens,
} = await import('./config.js');

describe('Config Service', () => {
  beforeEach(() => {
    // Reset mock store before each test
    mockStore = {};
  });

  describe('getJiraConfig', () => {
    it('should return null if not configured', () => {
      const config = getJiraConfig();
      expect(config).toBeNull();
    });

    it('should return API token config when all fields are set', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        authMethod: 'api-token',
        email: 'test@example.com',
        apiToken: 'api-token-123',
      };

      const config = getJiraConfig();

      expect(config).toEqual({
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'api-token',
          email: 'test@example.com',
          apiToken: 'api-token-123',
        },
      });
    });

    it('should return OAuth config when all fields are set', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        authMethod: 'oauth',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresAt: Date.now() + 3600000,
        cloudId: 'cloud-id-123',
      };

      const config = getJiraConfig();

      expect(config).toEqual({
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'oauth',
          accessToken: 'access-token-123',
          refreshToken: 'refresh-token-123',
          expiresAt: mockStore.expiresAt,
          cloudId: 'cloud-id-123',
        },
      });
    });

    it('should return null if any API token field is missing', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        authMethod: 'api-token',
        email: 'test@example.com',
        apiToken: '', // Missing API token
      };

      const config = getJiraConfig();
      expect(config).toBeNull();
    });

    it('should return null if authMethod is missing', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'api-token-123',
      };

      const config = getJiraConfig();
      expect(config).toBeNull();
    });
  });

  describe('setJiraConfig', () => {
    it('should set API token config values', () => {
      const config = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'api-token' as const,
          email: 'test@example.com',
          apiToken: 'api-token-123',
        },
      };

      setJiraConfig(config);

      expect(mockStore.jiraHost).toBe('https://test.atlassian.net');
      expect(mockStore.authMethod).toBe('api-token');
      expect(mockStore.email).toBe('test@example.com');
      expect(mockStore.apiToken).toBe('api-token-123');
    });

    it('should set OAuth config values', () => {
      const expiresAt = Date.now() + 3600000;
      const config = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'oauth' as const,
          accessToken: 'access-token-123',
          refreshToken: 'refresh-token-123',
          expiresAt,
          cloudId: 'cloud-id-123',
        },
      };

      setJiraConfig(config);

      expect(mockStore.jiraHost).toBe('https://test.atlassian.net');
      expect(mockStore.authMethod).toBe('oauth');
      expect(mockStore.accessToken).toBe('access-token-123');
      expect(mockStore.refreshToken).toBe('refresh-token-123');
      expect(mockStore.expiresAt).toBe(expiresAt);
      expect(mockStore.cloudId).toBe('cloud-id-123');
    });

    it('should clear OAuth fields when setting API token config', () => {
      mockStore = {
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
      };

      setJiraConfig({
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'api-token',
          email: 'test@example.com',
          apiToken: 'api-token-123',
        },
      });

      expect(mockStore.accessToken).toBe('');
      expect(mockStore.refreshToken).toBe('');
    });
  });

  describe('clearJiraConfig', () => {
    it('should delete all config values', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        authMethod: 'api-token',
        email: 'test@example.com',
        apiToken: 'api-token-123',
      };

      clearJiraConfig();

      expect(mockStore.jiraHost).toBeUndefined();
      expect(mockStore.authMethod).toBeUndefined();
      expect(mockStore.email).toBeUndefined();
      expect(mockStore.apiToken).toBeUndefined();
    });
  });

  describe('isConfigured', () => {
    it('should return true when configured with API token', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        authMethod: 'api-token',
        email: 'test@example.com',
        apiToken: 'api-token-123',
      };

      expect(isConfigured()).toBe(true);
    });

    it('should return true when configured with OAuth', () => {
      mockStore = {
        jiraHost: 'https://test.atlassian.net',
        authMethod: 'oauth',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresAt: Date.now() + 3600000,
        cloudId: 'cloud-id-123',
      };

      expect(isConfigured()).toBe(true);
    });

    it('should return false when not configured', () => {
      expect(isConfigured()).toBe(false);
    });
  });

  describe('isOAuthTokenExpired', () => {
    it('should return true if no expiry time set', () => {
      expect(isOAuthTokenExpired()).toBe(true);
    });

    it('should return true if token is expired', () => {
      mockStore.expiresAt = Date.now() - 1000; // 1 second ago
      expect(isOAuthTokenExpired()).toBe(true);
    });

    it('should return true if token expires within 5 minutes', () => {
      mockStore.expiresAt = Date.now() + 4 * 60 * 1000; // 4 minutes from now
      expect(isOAuthTokenExpired()).toBe(true);
    });

    it('should return false if token is valid', () => {
      mockStore.expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now
      expect(isOAuthTokenExpired()).toBe(false);
    });
  });

  describe('updateOAuthTokens', () => {
    it('should update OAuth tokens', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      updateOAuthTokens('new-access-token', 'new-refresh-token', 3600);

      expect(mockStore.accessToken).toBe('new-access-token');
      expect(mockStore.refreshToken).toBe('new-refresh-token');
      expect(mockStore.expiresAt).toBe(now + 3600000);

      vi.restoreAllMocks();
    });
  });

  describe('getActiveTimer', () => {
    it('should return empty string if no active timer', () => {
      expect(getActiveTimer()).toBe('');
    });

    it('should return timer state when present', () => {
      const timerState = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: Date.now(),
        pausedAt: null,
        totalPausedTime: 0,
        isPaused: false,
        isRunning: true,
      };

      mockStore.activeTimer = timerState;

      expect(getActiveTimer()).toEqual(timerState);
    });
  });

  describe('setActiveTimer', () => {
    it('should set the active timer', () => {
      const timerState = {
        issueKey: 'TEST-123',
        description: 'Test',
        startedAt: Date.now(),
        pausedAt: null,
        totalPausedTime: 0,
        isPaused: false,
        isRunning: true,
      };

      setActiveTimer(timerState);

      expect(mockStore.activeTimer).toEqual(timerState);
    });
  });

  describe('clearActiveTimer', () => {
    it('should set active timer to null', () => {
      mockStore.activeTimer = { issueKey: 'TEST-123' };

      clearActiveTimer();

      expect(mockStore.activeTimer).toBeNull();
    });
  });

  describe('getConfigPath', () => {
    it('should return the config path', () => {
      expect(getConfigPath()).toBe('/mock/path/config.json');
    });
  });

  describe('maskApiToken', () => {
    it('should mask tokens longer than 8 characters', () => {
      expect(maskApiToken('abcd1234efgh5678')).toBe('abcd****5678');
    });

    it('should return **** for short tokens', () => {
      expect(maskApiToken('short')).toBe('****');
      expect(maskApiToken('12345678')).toBe('****');
    });

    it('should handle edge cases', () => {
      expect(maskApiToken('123456789')).toBe('1234****6789');
    });
  });
});
