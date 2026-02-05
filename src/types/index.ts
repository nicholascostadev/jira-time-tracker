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
