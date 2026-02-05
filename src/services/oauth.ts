import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import open from 'open';
import type {
  OAuthTokenResponse,
  JiraCloudResource,
  OAuthClientConfig,
} from '../types/index.js';

const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ATLASSIAN_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

// OAuth scopes needed for Jira time tracking
const SCOPES = [
  'read:jira-user',
  'read:jira-work',
  'write:jira-work',
  'offline_access', // For refresh tokens
].join(' ');

const CALLBACK_PORT = 8742;
const CALLBACK_PATH = '/oauth/callback';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

export interface OAuthResult {
  tokens: OAuthTokenResponse;
  cloudId: string;
  siteName: string;
  siteUrl: string;
}

/**
 * Start the OAuth 2.0 authorization flow
 * This opens a browser for the user to authorize the app and starts a local server
 * to receive the callback with the authorization code.
 */
export async function startOAuthFlow(clientConfig: OAuthClientConfig): Promise<OAuthResult> {
  return new Promise((resolve, reject) => {
    // Create a local server to handle the callback
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname === CALLBACK_PATH) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc3545;">Authorization Failed</h1>
                <p>${errorDescription ?? error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(errorDescription ?? error));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc3545;">Authorization Failed</h1>
                <p>No authorization code received.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        try {
          // Exchange code for tokens
          const tokens = await exchangeCodeForTokens(code, clientConfig);

          // Get accessible Jira sites
          const resources = await getAccessibleResources(tokens.access_token);

          if (resources.length === 0) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; padding: 40px; text-align: center;">
                  <h1 style="color: #dc3545;">No Jira Sites Found</h1>
                  <p>No accessible Jira Cloud sites were found for your account.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error('No accessible Jira Cloud sites found'));
            return;
          }

          // Use the first available site (or we could prompt user to choose)
          const site = resources[0];

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #28a745;">Authorization Successful!</h1>
                <p>Connected to: <strong>${site.name}</strong></p>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);

          server.close();
          resolve({
            tokens,
            cloudId: site.id,
            siteName: site.name,
            siteUrl: site.url,
          });
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc3545;">Authorization Failed</h1>
                <p>${err instanceof Error ? err.message : 'Unknown error'}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(CALLBACK_PORT, () => {
      // Build authorization URL
      const authUrl = new URL(ATLASSIAN_AUTH_URL);
      authUrl.searchParams.set('audience', 'api.atlassian.com');
      authUrl.searchParams.set('client_id', clientConfig.clientId);
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('prompt', 'consent');

      // Open browser for authorization
      open(authUrl.toString());
    });

    server.on('error', (err) => {
      reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth authorization timed out'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Exchange authorization code for access and refresh tokens
 */
async function exchangeCodeForTokens(
  code: string,
  clientConfig: OAuthClientConfig
): Promise<OAuthTokenResponse> {
  const response = await fetch(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientConfig.clientId,
      client_secret: clientConfig.clientSecret,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientConfig: OAuthClientConfig
): Promise<OAuthTokenResponse> {
  const response = await fetch(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientConfig.clientId,
      client_secret: clientConfig.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh access token: ${error}`);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

/**
 * Get list of Jira Cloud sites accessible with the given token
 */
async function getAccessibleResources(accessToken: string): Promise<JiraCloudResource[]> {
  const response = await fetch(ATLASSIAN_RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get accessible resources: ${error}`);
  }

  return response.json() as Promise<JiraCloudResource[]>;
}

/**
 * Get the callback URL for setting up OAuth in Atlassian Developer Console
 */
export function getCallbackUrl(): string {
  return REDIRECT_URI;
}
