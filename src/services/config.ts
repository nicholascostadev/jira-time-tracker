import Conf from 'conf';
import { z } from 'zod/v4';
import { FailedWorklogSchema } from '../types/index.js';
import type { FailedWorklog, JiraConfig, TimerState } from '../types/index.js';

interface ConfigSchema {
  jiraHost: string;
  email: string;
  apiToken: string;
  activeTimer: TimerState | null;
  failedWorklogs: FailedWorklog[];
}

const config = new Conf<ConfigSchema>({
  projectName: 'jira-time-tracker',
  schema: {
    jiraHost: {
      type: 'string',
      default: '',
    },
    email: {
      type: 'string',
      default: '',
    },
    apiToken: {
      type: 'string',
      default: '',
    },
    activeTimer: {
      type: ['object', 'null'],
      default: null,
    },
    failedWorklogs: {
      type: 'array',
      default: [],
    },
  },
});

export function getJiraConfig(): JiraConfig | null {
  const jiraHost = config.get('jiraHost');
  const email = config.get('email');
  const apiToken = config.get('apiToken');

  if (!jiraHost || !email || !apiToken) {
    return null;
  }

  return {
    jiraHost,
    auth: {
      method: 'api-token',
      email,
      apiToken,
    },
  };
}

export function setJiraConfig(jiraConfig: JiraConfig): void {
  config.set('jiraHost', jiraConfig.jiraHost);
  config.set('email', jiraConfig.auth.email);
  config.set('apiToken', jiraConfig.auth.apiToken);
}

export function clearJiraConfig(): void {
  config.delete('jiraHost');
  config.delete('email');
  config.delete('apiToken');

  // Cleanup old OAuth-era keys if they exist from previous versions.
  config.delete('authMethod' as keyof ConfigSchema);
  config.delete('accessToken' as keyof ConfigSchema);
  config.delete('refreshToken' as keyof ConfigSchema);
  config.delete('expiresAt' as keyof ConfigSchema);
  config.delete('cloudId' as keyof ConfigSchema);
  config.delete('oauthClientId' as keyof ConfigSchema);
  config.delete('oauthClientSecret' as keyof ConfigSchema);
}

export function isConfigured(): boolean {
  return getJiraConfig() !== null;
}

export function getActiveTimer(): TimerState | null {
  const timer = config.get('activeTimer');
  if (!timer || typeof timer !== 'object') {
    return null;
  }
  return timer as TimerState;
}

export function setActiveTimer(timer: TimerState | null): void {
  config.set('activeTimer', timer);
}

export function clearActiveTimer(): void {
  config.set('activeTimer', null);
}

export function getConfigPath(): string {
  return config.path;
}

export function getFailedWorklogs(): FailedWorklog[] {
  const raw = config.get('failedWorklogs');
  const parsed = z.array(FailedWorklogSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function addFailedWorklog(worklog: FailedWorklog): void {
  const queue = getFailedWorklogs();
  queue.push(worklog);
  config.set('failedWorklogs', queue);
}

export function removeFailedWorklog(index: number): void {
  const queue = getFailedWorklogs();
  queue.splice(index, 1);
  config.set('failedWorklogs', queue);
}

export function clearFailedWorklogs(): void {
  config.set('failedWorklogs', []);
}

export function maskApiToken(token: string): string {
  if (token.length <= 8) {
    return '****';
  }
  return token.slice(0, 4) + '****' + token.slice(-4);
}
