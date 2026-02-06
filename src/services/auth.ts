import {
  getJiraConfig,
  setJiraConfig,
  isOAuthTokenExpired,
  getOAuthClientConfig,
  updateOAuthTokens,
} from './config.js';
import { initializeJiraClient } from './jira.js';
import { refreshAccessToken } from './oauth.js';
import type { JiraConfig } from '../types/index.js';

/**
 * Ensures authentication is valid and initializes the Jira client.
 * For OAuth, this will refresh the token if it's expired.
 * Returns the config if successful, exits the process if not.
 */
export async function ensureAuthenticated(): Promise<JiraConfig> {
  const config = getJiraConfig();

  if (!config) {
    throw new Error('Not configured. Run "jtt config" first.');
  }

  // For OAuth, check if token needs refresh
  if (config.auth.method === 'oauth' && isOAuthTokenExpired()) {
    const clientConfig = getOAuthClientConfig();

    if (!clientConfig) {
      throw new Error('OAuth client config missing. Run "jtt config" to reconfigure.');
    }

    try {
      const tokens = await refreshAccessToken(config.auth.refreshToken, clientConfig);

      // Update stored tokens
      updateOAuthTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);

      // Update the config object with new access token
      const updatedConfig: JiraConfig = {
        ...config,
        auth: {
          ...config.auth,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        },
      };

      // Re-initialize client with new token
      initializeJiraClient(updatedConfig);

      return updatedConfig;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to refresh OAuth token: ${message}. Token may have been revoked — run "jtt config" to re-authenticate.`
      );
    }
  }

  // Initialize client with current config
  initializeJiraClient(config);

  return config;
}
