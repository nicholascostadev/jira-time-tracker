import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetJiraConfig = vi.fn();

vi.mock('./config.js', () => ({
  getJiraConfig: (...args: unknown[]) => mockGetJiraConfig(...args),
}));

const mockInitializeJiraClient = vi.fn();

vi.mock('./jira.js', () => ({
  initializeJiraClient: (...args: unknown[]) => mockInitializeJiraClient(...args),
}));

const { ensureAuthenticated } = await import('./auth.js');

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when not configured', async () => {
    mockGetJiraConfig.mockReturnValue(null);

    await expect(ensureAuthenticated()).rejects.toThrow(
      'Not configured. Run "jtt config" first.'
    );
  });

  it('initializes Jira client and returns config', async () => {
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
});
