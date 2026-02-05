import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { JiraConfig } from '../types/index.js';

// Mock functions for the client
const mockGetIssue = vi.fn();
const mockAddWorklog = vi.fn();
const mockGetCurrentUser = vi.fn();

// Mock fetch for search API
const mockFetch = vi.fn();
(mockFetch as any).preconnect = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock jira.js before importing
vi.mock('jira.js', () => {
  return {
    Version2Client: class MockVersion2Client {
      issues = {
        getIssue: mockGetIssue,
      };
      issueWorklogs = {
        addWorklog: mockAddWorklog,
      };
      myself = {
        getCurrentUser: mockGetCurrentUser,
      };
    },
  };
});

// Import after mocking
const {
  initializeJiraClient,
  getJiraClient,
  getIssue,
  addWorklog,
  testConnection,
  getMyAssignedIssues,
  getCurrentUser,
} = await import('./jira.js');

// Helper to create a test config
function createTestConfig(overrides?: Partial<JiraConfig>): JiraConfig {
  return {
    jiraHost: 'https://test.atlassian.net',
    auth: {
      method: 'api-token',
      email: 'test@example.com',
      apiToken: 'api-token',
    },
    ...overrides,
  };
}

describe('Jira Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeJiraClient', () => {
    it('should initialize the Jira client with API token auth', () => {
      const config = createTestConfig();

      initializeJiraClient(config);

      // Client should be initialized (no error thrown)
      expect(() => getJiraClient()).not.toThrow();
    });

    it('should initialize the Jira client with OAuth auth', () => {
      const config: JiraConfig = {
        jiraHost: 'https://test.atlassian.net',
        auth: {
          method: 'oauth',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3600000,
          cloudId: 'cloud-id-123',
        },
      };

      initializeJiraClient(config);

      // Client should be initialized (no error thrown)
      expect(() => getJiraClient()).not.toThrow();
    });
  });

  describe('getIssue', () => {
    beforeEach(() => {
      initializeJiraClient(createTestConfig());
    });

    it('should return issue details', async () => {
      mockGetIssue.mockResolvedValue({
        key: 'TEST-123',
        fields: {
          summary: 'Test issue summary',
          status: { name: 'In Progress' },
        },
      });

      const issue = await getIssue('TEST-123');

      expect(issue).toEqual({
        key: 'TEST-123',
        summary: 'Test issue summary',
        status: 'In Progress',
      });

      expect(mockGetIssue).toHaveBeenCalledWith({
        issueIdOrKey: 'TEST-123',
        fields: ['summary', 'status'],
      });
    });

    it('should throw error for 404', async () => {
      const error = new Error('Not found');
      (error as Error & { response: { status: number } }).response = { status: 404 };
      mockGetIssue.mockRejectedValue(error);

      await expect(getIssue('NOTFOUND-123')).rejects.toThrow('Issue NOTFOUND-123 not found');
    });

    it('should throw error for 401', async () => {
      const error = new Error('Unauthorized');
      (error as Error & { response: { status: number } }).response = { status: 401 };
      mockGetIssue.mockRejectedValue(error);

      await expect(getIssue('TEST-123')).rejects.toThrow('Authentication failed');
    });
  });

  describe('addWorklog', () => {
    beforeEach(() => {
      initializeJiraClient(createTestConfig());
    });

    it('should add worklog successfully', async () => {
      mockAddWorklog.mockResolvedValue({
        id: 'worklog-123',
      });

      const result = await addWorklog(
        'TEST-123',
        3600, // 1 hour
        'Working on feature',
        new Date('2024-01-15T10:00:00Z')
      );

      expect(result).toEqual({
        id: 'worklog-123',
        issueKey: 'TEST-123',
        timeSpentSeconds: 3600,
        started: '2024-01-15T10:00:00.000Z',
        comment: 'Working on feature',
      });
    });

    it('should enforce minimum 60 seconds', async () => {
      mockAddWorklog.mockResolvedValue({
        id: 'worklog-123',
      });

      const result = await addWorklog('TEST-123', 30, 'Quick fix', new Date());

      expect(result.timeSpentSeconds).toBe(60);
      expect(mockAddWorklog).toHaveBeenCalledWith(
        expect.objectContaining({
          timeSpentSeconds: 60,
        })
      );
    });

    it('should throw error for 403', async () => {
      const error = new Error('Forbidden');
      (error as Error & { response: { status: number } }).response = { status: 403 };
      mockAddWorklog.mockRejectedValue(error);

      await expect(addWorklog('TEST-123', 3600, 'Test', new Date())).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('testConnection', () => {
    beforeEach(() => {
      initializeJiraClient(createTestConfig());
    });

    it('should return true when connection succeeds', async () => {
      mockGetCurrentUser.mockResolvedValue({ displayName: 'Test User' });

      const result = await testConnection();

      expect(result).toBe(true);
    });

    it('should return false when connection fails', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('Connection failed'));

      const result = await testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getMyAssignedIssues', () => {
    beforeEach(() => {
      initializeJiraClient(createTestConfig());
    });

    it('should return assigned issues', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            issues: [
              {
                key: 'TEST-1',
                fields: { summary: 'First issue', status: { name: 'To Do' } },
              },
              {
                key: 'TEST-2',
                fields: { summary: 'Second issue', status: { name: 'In Progress' } },
              },
            ],
          }),
      });

      const issues = await getMyAssignedIssues();

      expect(issues).toEqual([
        { key: 'TEST-1', summary: 'First issue', status: 'To Do' },
        { key: 'TEST-2', summary: 'Second issue', status: 'In Progress' },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/search/jql',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',
            fields: ['summary', 'status'],
            maxResults: 50,
          }),
        })
      );
    });

    it('should return empty array when no issues', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ issues: [] }),
      });

      const issues = await getMyAssignedIssues();

      expect(issues).toEqual([]);
    });

    it('should throw error for 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(getMyAssignedIssues()).rejects.toThrow('Authentication failed');
    });
  });

  describe('getCurrentUser', () => {
    beforeEach(() => {
      initializeJiraClient(createTestConfig());
    });

    it('should return current user info', async () => {
      mockGetCurrentUser.mockResolvedValue({
        displayName: 'John Doe',
        emailAddress: 'john@example.com',
      });

      const user = await getCurrentUser();

      expect(user).toEqual({
        displayName: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should handle missing fields', async () => {
      mockGetCurrentUser.mockResolvedValue({});

      const user = await getCurrentUser();

      expect(user).toEqual({
        displayName: 'Unknown',
        email: '',
      });
    });
  });
});
