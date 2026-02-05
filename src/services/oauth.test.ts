import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the open package
vi.mock('open', () => ({
  default: vi.fn(),
}));

// Mock fetch for token exchange and resource fetching
const mockFetch = vi.fn();
(mockFetch as any).preconnect = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const { getCallbackUrl, refreshAccessToken } = await import('./oauth.js');

describe('OAuth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCallbackUrl', () => {
    it('should return the correct callback URL', () => {
      const url = getCallbackUrl();
      expect(url).toBe('http://localhost:8742/oauth/callback');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh the access token', async () => {
      const mockResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        scope: 'read:jira-user read:jira-work write:jira-work offline_access',
        token_type: 'Bearer',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await refreshAccessToken('old-refresh-token', {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.atlassian.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            refresh_token: 'old-refresh-token',
          }),
        })
      );
    });

    it('should throw error when refresh fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Invalid refresh token'),
      });

      await expect(
        refreshAccessToken('invalid-token', {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        })
      ).rejects.toThrow('Failed to refresh access token');
    });
  });

  // Note: startOAuthFlow is harder to test because it involves HTTP server and browser
  // In a real-world scenario, we would use integration tests or mock the http module
});
