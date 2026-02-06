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

export function initializeJiraClient(config: JiraConfig): void {
  currentConfig = config;

  if (config.auth.method === 'api-token') {
    client = new Version2Client({
      host: config.jiraHost,
      authentication: {
        basic: {
          email: config.auth.email,
          apiToken: config.auth.apiToken,
        },
      },
    });
  } else if (config.auth.method === 'oauth') {
    // For OAuth, we use the Atlassian API with cloudId
    client = new Version2Client({
      host: `https://api.atlassian.com/ex/jira/${config.auth.cloudId}`,
      authentication: {
        oauth2: {
          accessToken: config.auth.accessToken,
        },
      },
    });
  }
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

  if (currentConfig.auth.method === 'api-token') {
    const credentials = Buffer.from(
      `${currentConfig.auth.email}:${currentConfig.auth.apiToken}`
    ).toString('base64');
    return {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };
  } else {
    return {
      Authorization: `Bearer ${currentConfig.auth.accessToken}`,
      'Content-Type': 'application/json',
    };
  }
}

function getApiBaseUrl(): string {
  if (!currentConfig) {
    throw new Error('Jira client not initialized. Run "jtt config" first.');
  }

  if (currentConfig.auth.method === 'oauth') {
    return `https://api.atlassian.com/ex/jira/${currentConfig.auth.cloudId}`;
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
        throw new Error('Authentication failed. Check your credentials with "jtt config"');
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
        throw new Error('Authentication failed. Check your credentials with "jtt config"');
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

  try {
    // Use the new /rest/api/3/search/jql endpoint (POST method)
    const response = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
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
        throw new Error('Authentication failed. Check your credentials with "jtt config"');
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
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to search issues');
  }
}

export async function getCurrentUser(): Promise<{ displayName: string; email: string }> {
  const jira = getJiraClient();

  const user = await jira.myself.getCurrentUser();
  return {
    displayName: user.displayName ?? 'Unknown',
    email: user.emailAddress ?? '',
  };
}
