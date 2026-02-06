import { z } from 'zod/v4';

export type AuthMethod = 'api-token' | 'oauth';

export interface ApiTokenAuth {
  method: 'api-token';
  email: string;
  apiToken: string;
}

export interface OAuthAuth {
  method: 'oauth';
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  cloudId: string; // Jira Cloud ID for API calls
}

export type JiraAuth = ApiTokenAuth | OAuthAuth;

export interface JiraConfig {
  jiraHost: string;
  auth: JiraAuth;
}

// Legacy config for backwards compatibility during migration
export interface LegacyJiraConfig {
  jiraHost: string;
  email: string;
  apiToken: string;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface JiraCloudResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl: string;
}

export interface TimerState {
  issueKey: string;
  description: string;
  startedAt: number;
  pausedAt: number | null;
  totalPausedTime: number;
  isPaused: boolean;
  isRunning: boolean;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
}

export interface WorklogResult {
  id: string;
  issueKey: string;
  timeSpentSeconds: number;
  started: string;
  comment: string;
}

export interface FailedWorklog {
  issueKey: string;
  timeSpentSeconds: number;
  comment: string;
  started: string;
  failedAt: number;
  error: string;
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const OAuthTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.string(),
  token_type: z.string(),
});

export const JiraCloudResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  scopes: z.array(z.string()),
  avatarUrl: z.string(),
});

export const FailedWorklogSchema = z.object({
  issueKey: z.string(),
  timeSpentSeconds: z.number(),
  comment: z.string(),
  started: z.string(),
  failedAt: z.number(),
  error: z.string(),
});

export const AuthMethodSchema = z.enum(['api-token', 'oauth']);
