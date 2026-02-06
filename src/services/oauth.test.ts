import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JiraCloudResource } from '../types/index.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the open package
vi.mock('open', () => ({
  default: vi.fn(),
}));

// Capture the request handler that startOAuthFlow registers with createServer
let capturedRequestHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

const mockServerInstance = {
  listen: vi.fn((_port: number, cb: () => void) => cb()),
  close: vi.fn(),
  on: vi.fn(),
};

vi.mock('node:http', () => ({
  createServer: vi.fn((handler: (req: IncomingMessage, res: ServerResponse) => void) => {
    capturedRequestHandler = handler;
    return mockServerInstance;
  }),
}));

// Mock fetch for token exchange and resource fetching
const mockFetch = vi.fn();
(mockFetch as any).preconnect = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const { getCallbackUrl, refreshAccessToken, startOAuthFlow } = await import('./oauth.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockTokenResponse = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  scope: 'read:jira-user read:jira-work write:jira-work offline_access',
  token_type: 'Bearer',
};

const mockSite1: JiraCloudResource = {
  id: 'site-1',
  name: 'Site One',
  url: 'https://site-one.atlassian.net',
  scopes: ['read:jira-user'],
  avatarUrl: 'https://example.com/avatar1.png',
};

const mockSite2: JiraCloudResource = {
  id: 'site-2',
  name: 'Site Two',
  url: 'https://site-two.atlassian.net',
  scopes: ['read:jira-user'],
  avatarUrl: 'https://example.com/avatar2.png',
};

function setupFetchMocks(resources: JiraCloudResource[]) {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTokenResponse),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(resources),
    });
}

/**
 * Create a fake IncomingMessage with the given URL path + query
 */
function fakeRequest(url: string): IncomingMessage {
  return { url } as IncomingMessage;
}

/**
 * Create a fake ServerResponse that captures writeHead and end calls
 */
function fakeResponse(): ServerResponse & { _statusCode: number; _body: string } {
  const res = {
    _statusCode: 0,
    _body: '',
    writeHead(code: number, _headers?: Record<string, string>) {
      res._statusCode = code;
    },
    end(body?: string) {
      res._body = body ?? '';
    },
  };
  return res as unknown as ServerResponse & { _statusCode: number; _body: string };
}

/**
 * Simulate the browser callback by invoking the captured request handler.
 */
async function simulateCallback(queryString: string) {
  if (!capturedRequestHandler) throw new Error('No request handler captured');
  const req = fakeRequest(`/oauth/callback?${queryString}`);
  const res = fakeResponse();
  // The handler is async, so we await it
  await capturedRequestHandler(req, res);
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('OAuth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRequestHandler = null;
  });

  describe('getCallbackUrl', () => {
    it('should return the correct callback URL', () => {
      const url = getCallbackUrl();
      expect(url).toBe('http://localhost:8742/oauth/callback');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh the access token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      const result = await refreshAccessToken('old-refresh-token', {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      expect(result).toEqual(mockTokenResponse);
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

  describe('startOAuthFlow', () => {
    it('should auto-select the first site when only one is available', async () => {
      setupFetchMocks([mockSite1]);

      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      // Simulate callback with authorization code
      await simulateCallback('code=test-auth-code');

      const result = await flowPromise;
      expect(result).toEqual({
        tokens: mockTokenResponse,
        cloudId: 'site-1',
        siteName: 'Site One',
        siteUrl: 'https://site-one.atlassian.net',
      });
    });

    it('should auto-select first site when multiple sites exist but no siteSelector provided', async () => {
      setupFetchMocks([mockSite1, mockSite2]);

      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      await simulateCallback('code=test-auth-code');

      const result = await flowPromise;
      expect(result.cloudId).toBe('site-1');
      expect(result.siteName).toBe('Site One');
    });

    it('should call siteSelector when multiple sites exist and selector is provided', async () => {
      setupFetchMocks([mockSite1, mockSite2]);

      const siteSelector = vi.fn().mockResolvedValue(mockSite2);

      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        siteSelector,
      });

      await simulateCallback('code=test-auth-code');

      const result = await flowPromise;
      expect(siteSelector).toHaveBeenCalledWith([mockSite1, mockSite2]);
      expect(result.cloudId).toBe('site-2');
      expect(result.siteName).toBe('Site Two');
      expect(result.siteUrl).toBe('https://site-two.atlassian.net');
    });

    it('should reject when siteSelector returns null (cancelled)', async () => {
      setupFetchMocks([mockSite1, mockSite2]);

      const siteSelector = vi.fn().mockResolvedValue(null);

      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        siteSelector,
      });

      await simulateCallback('code=test-auth-code');

      await expect(flowPromise).rejects.toThrow('Site selection cancelled');
    });

    it('should reject when callback contains an error', async () => {
      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      await simulateCallback('error=access_denied&error_description=User+denied+access');

      await expect(flowPromise).rejects.toThrow('User denied access');
    });

    it('should reject when no authorization code is provided', async () => {
      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      await simulateCallback('');

      await expect(flowPromise).rejects.toThrow('No authorization code received');
    });

    it('should reject when no accessible sites are found', async () => {
      setupFetchMocks([]);

      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      await simulateCallback('code=test-auth-code');

      await expect(flowPromise).rejects.toThrow('No accessible Jira Cloud sites found');
    });

    it('should not call siteSelector when only one site exists', async () => {
      setupFetchMocks([mockSite1]);

      const siteSelector = vi.fn();

      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        siteSelector,
      });

      await simulateCallback('code=test-auth-code');

      await flowPromise;
      expect(siteSelector).not.toHaveBeenCalled();
    });

    it('should call server.close after successful flow', async () => {
      setupFetchMocks([mockSite1]);

      const flowPromise = startOAuthFlow({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      await simulateCallback('code=test-auth-code');
      await flowPromise;

      expect(mockServerInstance.close).toHaveBeenCalled();
    });
  });
});
