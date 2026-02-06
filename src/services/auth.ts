import { getJiraConfig } from './config.js';
import { initializeJiraClient } from './jira.js';
import type { JiraConfig } from '../types/index.js';

/**
 * Ensures authentication is configured and initializes the Jira client.
 */
export async function ensureAuthenticated(): Promise<JiraConfig> {
  const config = getJiraConfig();

  if (!config) {
    throw new Error('Not configured. Run "jtt config" first.');
  }

  initializeJiraClient(config);
  return config;
}
