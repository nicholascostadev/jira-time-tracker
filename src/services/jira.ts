import { Version2Client } from 'jira.js';
import { z } from 'zod/v4';
import type { JiraConfig, JiraIssue, WorklogResult } from '../types/index.js';

// ── Zod schemas for Jira API response shapes ────────────────────────────────

const JiraStatusFieldSchema = z.object({
  name: z.optional(z.string()),
}).optional();

const JiraErrorResponseSchema = z.object({
  response: z.optional(z.object({
    status: z.optional(z.number()),
  })),
});

const JiraSearchResponseSchema = z.object({
  issues: z.array(z.object({
    key: z.string(),
    fields: z.object({
      summary: z.optional(z.string()),
      status: JiraStatusFieldSchema,
    }),
  })).default([]),
  isLast: z.optional(z.boolean()),
  nextPageToken: z.optional(z.string()),
});

let client: Version2Client | null = null;
let currentConfig: JiraConfig | null = null;

const DEFAULT_TIMEOUT_MS = 10000;
const SEARCH_RETRY_ATTEMPTS = 2;
const AUTH_ERROR_MESSAGE = 'Authentication failed. Your Jira token may be invalid or expired.';

export class JiraAuthenticationError extends Error {
  readonly status = 401;

  constructor(message = AUTH_ERROR_MESSAGE) {
    super(message);
    this.name = 'JiraAuthenticationError';
  }
}

export function isJiraAuthenticationError(error: unknown): error is JiraAuthenticationError {
  if (error instanceof JiraAuthenticationError) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('authentication failed') || message.includes('unauthorized');
  }

  return false;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  return false;
}

export function initializeJiraClient(config: JiraConfig): void {
  currentConfig = config;

  client = new Version2Client({
    host: config.jiraHost,
    authentication: {
      basic: {
        email: config.auth.email,
        apiToken: config.auth.apiToken,
      },
    },
  });
}

export function getJiraClient(): Version2Client {
  if (!client) {
    throw new Error('Jira client not initialized. Run "jtt config" first.');
  }
  return client;
}

export function getCurrentConfig(): JiraConfig | null {
  return currentConfig;
}

function getAuthHeaders(): Record<string, string> {
  if (!currentConfig) {
    throw new Error('Jira client not initialized. Run "jtt config" first.');
  }

  const credentials = Buffer.from(
    `${currentConfig.auth.email}:${currentConfig.auth.apiToken}`
  ).toString('base64');

  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };
}

function getApiBaseUrl(): string {
  if (!currentConfig) {
    throw new Error('Jira client not initialized. Run "jtt config" first.');
  }

  return currentConfig.jiraHost;
}

export async function getIssue(issueKey: string): Promise<JiraIssue> {
  const jira = getJiraClient();

  try {
    const issue = await jira.issues.getIssue({
      issueIdOrKey: issueKey,
      fields: ['summary', 'status'],
    });

    const status = JiraStatusFieldSchema.safeParse(issue.fields.status);
    return {
      key: issue.key!,
      summary: issue.fields.summary ?? 'No summary',
      status: (status.success && status.data?.name) ? status.data.name : 'Unknown',
    };
  } catch (error: unknown) {
    const parsed = JiraErrorResponseSchema.safeParse(error);
    if (parsed.success && parsed.data.response?.status) {
      const httpStatus = parsed.data.response.status;
      if (httpStatus === 404) {
        throw new Error(`Issue ${issueKey} not found`);
      }
      if (httpStatus === 401) {
        throw new JiraAuthenticationError();
      }
    }
    throw error;
  }
}

export async function addWorklog(
  issueKey: string,
  timeSpentSeconds: number,
  comment: string,
  started: Date
): Promise<WorklogResult> {
  const jira = getJiraClient();

  // Jira expects at least 60 seconds (1 minute) for worklogs
  const adjustedTime = Math.max(timeSpentSeconds, 60);

  try {
    const worklog = await jira.issueWorklogs.addWorklog({
      issueIdOrKey: issueKey,
      timeSpentSeconds: adjustedTime,
      started: started.toISOString().replace('Z', '+0000'),
      comment: comment,
    });

    return {
      id: worklog.id ?? 'unknown',
      issueKey,
      timeSpentSeconds: adjustedTime,
      started: started.toISOString(),
      comment,
    };
  } catch (error: unknown) {
    const parsed = JiraErrorResponseSchema.safeParse(error);
    if (parsed.success && parsed.data.response?.status) {
      const httpStatus = parsed.data.response.status;
      if (httpStatus === 401) {
        throw new JiraAuthenticationError();
      }
      if (httpStatus === 403) {
        throw new Error(
          'Permission denied. You may not have permission to log work on this issue.'
        );
      }
    }
    throw error;
  }
}

export async function testConnection(): Promise<boolean> {
  const jira = getJiraClient();

  try {
    await jira.myself.getCurrentUser();
    return true;
  } catch {
    return false;
  }
}

export async function getMyAssignedIssues(): Promise<JiraIssue[]> {
  const baseUrl = getApiBaseUrl();
  const headers = getAuthHeaders();

  for (let attempt = 0; attempt <= SEARCH_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/rest/api/3/search/jql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',
          fields: ['summary', 'status'],
          maxResults: 50,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new JiraAuthenticationError();
        }

        if (isRetryableStatus(response.status) && attempt < SEARCH_RETRY_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }

        const errorText = await response.text();
        throw new Error(`Failed to search issues: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const result = JiraSearchResponseSchema.parse(data);

      return result.issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields.summary ?? 'No summary',
        status: issue.fields.status?.name ?? 'Unknown',
      }));
    } catch (error: unknown) {
      if (isRetryableError(error) && attempt < SEARCH_RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Search request timed out. Please check your network and try again.');
        }
        throw error;
      }
      throw new Error('Failed to search issues');
    }
  }

  throw new Error('Failed to search issues after retries');
}

export async function getCurrentUser(): Promise<{ displayName: string; email: string }> {
  const jira = getJiraClient();

  try {
    const user = await jira.myself.getCurrentUser();
    return {
      displayName: user.displayName ?? 'Unknown',
      email: user.emailAddress ?? '',
    };
  } catch (error: unknown) {
    const parsed = JiraErrorResponseSchema.safeParse(error);
    if (parsed.success && parsed.data.response?.status === 401) {
      throw new JiraAuthenticationError();
    }
    throw error;
  }
}
