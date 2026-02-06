import { z } from 'zod/v4';

export interface ApiTokenAuth {
  method: 'api-token';
  email: string;
  apiToken: string;
}

export type JiraAuth = ApiTokenAuth;

export interface JiraConfig {
  jiraHost: string;
  auth: JiraAuth;
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

export const FailedWorklogSchema = z.object({
  issueKey: z.string(),
  timeSpentSeconds: z.number(),
  comment: z.string(),
  started: z.string(),
  failedAt: z.number(),
  error: z.string(),
});
