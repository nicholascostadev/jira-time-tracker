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
    console.log();
    console.log('x not configured');
    console.log('\x1b[90m  run "jtt config" first\x1b[0m');
    console.log();
    process.exit(1);
  }

  // For OAuth, check if token needs refresh
  if (config.auth.method === 'oauth' && isOAuthTokenExpired()) {
    const clientConfig = getOAuthClientConfig();

    if (!clientConfig) {
      console.log();
      console.log('x oauth config missing');
      console.log('\x1b[90m  run "jtt config" to reconfigure\x1b[0m');
      console.log();
      process.exit(1);
    }

    console.log('... refreshing token');

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
      console.log('+ token refreshed');

      return updatedConfig;
    } catch (error) {
      console.error('x failed to refresh token');
      if (error instanceof Error) {
        console.error(`\x1b[90m  ${error.message}\x1b[0m`);
      }
      console.log();
      console.log('\x1b[90mtoken may have been revoked. run "jtt config" to re-authenticate\x1b[0m');
      console.log();
      process.exit(1);
    }
  }

  // Initialize client with current config
  initializeJiraClient(config);

  return config;
}
