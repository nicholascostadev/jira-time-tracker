import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock config service
const mockGetJiraConfig = vi.fn();
const mockSetJiraConfig = vi.fn();
const mockIsOAuthTokenExpired = vi.fn();
const mockGetOAuthClientConfig = vi.fn();
const mockUpdateOAuthTokens = vi.fn();

vi.mock('./config.js', () => ({
  getJiraConfig: (...args: unknown[]) => mockGetJiraConfig(...args),
  setJiraConfig: (...args: unknown[]) => mockSetJiraConfig(...args),
  isOAuthTokenExpired: (...args: unknown[]) => mockIsOAuthTokenExpired(...args),
  getOAuthClientConfig: (...args: unknown[]) => mockGetOAuthClientConfig(...args),
  updateOAuthTokens: (...args: unknown[]) => mockUpdateOAuthTokens(...args),
}));

// Mock jira service
const mockInitializeJiraClient = vi.fn();

vi.mock('./jira.js', () => ({
  initializeJiraClient: (...args: unknown[]) => mockInitializeJiraClient(...args),
}));

// Mock oauth service
const mockRefreshAccessToken = vi.fn();

vi.mock('./oauth.js', () => ({
  refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
}));

const { ensureAuthenticated } = await import('./auth.js');

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureAuthenticated', () => {
    it('should throw error when not configured', async () => {
      mockGetJiraConfig.mockReturnValue(null);

      await expect(ensureAuthenticated()).rejects.toThrow(
        'Not configured. Run "jtt config" first.'
      );
    });

    it('should initialize client and return config for API token auth', async () => {
      const config = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'api-token' as const,
          email: 'test@example.com',
          apiToken: 'token-123',
        },
      };

      mockGetJiraConfig.mockReturnValue(config);

      const result = await ensureAuthenticated();

      expect(result).toEqual(config);
      expect(mockInitializeJiraClient).toHaveBeenCalledWith(config);
    });

    it('should initialize client and return config for valid OAuth (not expired)', async () => {
      const config = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'oauth' as const,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3600000,
          cloudId: 'cloud-123',
        },
      };

      mockGetJiraConfig.mockReturnValue(config);
      mockIsOAuthTokenExpired.mockReturnValue(false);

      const result = await ensureAuthenticated();

      expect(result).toEqual(config);
      expect(mockInitializeJiraClient).toHaveBeenCalledWith(config);
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    });

    it('should refresh token when OAuth token is expired', async () => {
      const config = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'oauth' as const,
          accessToken: 'old-access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() - 1000,
          cloudId: 'cloud-123',
        },
      };

      const clientConfig = {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      };

      const newTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        scope: 'read:jira-user',
        token_type: 'Bearer',
      };

      mockGetJiraConfig.mockReturnValue(config);
      mockIsOAuthTokenExpired.mockReturnValue(true);
      mockGetOAuthClientConfig.mockReturnValue(clientConfig);
      mockRefreshAccessToken.mockResolvedValue(newTokens);

      const result = await ensureAuthenticated();

      expect(mockRefreshAccessToken).toHaveBeenCalledWith('refresh-token', clientConfig);
      expect(mockUpdateOAuthTokens).toHaveBeenCalledWith(
        'new-access-token',
        'new-refresh-token',
        3600
      );
      expect(mockInitializeJiraClient).toHaveBeenCalled();
      expect(result.auth).toMatchObject({
        method: 'oauth',
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should throw error when OAuth client config is missing', async () => {
      const config = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'oauth' as const,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() - 1000,
          cloudId: 'cloud-123',
        },
      };

      mockGetJiraConfig.mockReturnValue(config);
      mockIsOAuthTokenExpired.mockReturnValue(true);
      mockGetOAuthClientConfig.mockReturnValue(null);

      await expect(ensureAuthenticated()).rejects.toThrow(
        'OAuth client config missing. Run "jtt config" to reconfigure.'
      );
    });

    it('should throw error when token refresh fails', async () => {
      const config = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'oauth' as const,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() - 1000,
          cloudId: 'cloud-123',
        },
      };

      const clientConfig = {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      };

      mockGetJiraConfig.mockReturnValue(config);
      mockIsOAuthTokenExpired.mockReturnValue(true);
      mockGetOAuthClientConfig.mockReturnValue(clientConfig);
      mockRefreshAccessToken.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(ensureAuthenticated()).rejects.toThrow(
        'Failed to refresh OAuth token: Invalid refresh token. Token may have been revoked'
      );
    });

    it('should not attempt refresh for non-expired OAuth token', async () => {
      const config = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'oauth' as const,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3600000,
          cloudId: 'cloud-123',
        },
      };

      mockGetJiraConfig.mockReturnValue(config);
      mockIsOAuthTokenExpired.mockReturnValue(false);

      await ensureAuthenticated();

      expect(mockGetOAuthClientConfig).not.toHaveBeenCalled();
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    });
  });
});
