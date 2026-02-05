import Conf from 'conf';
import type {
  JiraConfig,
  JiraAuth,
  TimerState,
  OAuthClientConfig,
  AuthMethod,
} from '../types/index.js';

interface ConfigSchema {
  jiraHost: string;
  authMethod: AuthMethod | '';
  // API Token auth
  email: string;
  apiToken: string;
  // OAuth auth
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  cloudId: string;
  // OAuth client credentials (stored separately for security)
  oauthClientId: string;
  oauthClientSecret: string;
  // Timer state
  activeTimer: TimerState | null;
}

const config = new Conf<ConfigSchema>({
  projectName: 'jira-time-tracker',
  schema: {
    jiraHost: {
      type: 'string',
      default: '',
    },
    authMethod: {
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
    accessToken: {
      type: 'string',
      default: '',
    },
    refreshToken: {
      type: 'string',
      default: '',
    },
    expiresAt: {
      type: 'number',
      default: 0,
    },
    cloudId: {
      type: 'string',
      default: '',
    },
    oauthClientId: {
      type: 'string',
      default: '',
    },
    oauthClientSecret: {
      type: 'string',
      default: '',
    },
    activeTimer: {
      type: ['object', 'null'],
      default: null,
    },
  },
});

export function getJiraConfig(): JiraConfig | null {
  const jiraHost = config.get('jiraHost');
  const authMethod = config.get('authMethod') as AuthMethod | '';

  if (!jiraHost || !authMethod) {
    return null;
  }

  if (authMethod === 'api-token') {
    const email = config.get('email');
    const apiToken = config.get('apiToken');

    if (!email || !apiToken) {
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

  if (authMethod === 'oauth') {
    const accessToken = config.get('accessToken');
    const refreshToken = config.get('refreshToken');
    const expiresAt = config.get('expiresAt');
    const cloudId = config.get('cloudId');

    if (!accessToken || !refreshToken || !cloudId) {
      return null;
    }

    return {
      jiraHost,
      auth: {
        method: 'oauth',
        accessToken,
        refreshToken,
        expiresAt,
        cloudId,
      },
    };
  }

  return null;
}

export function setJiraConfig(jiraConfig: JiraConfig): void {
  config.set('jiraHost', jiraConfig.jiraHost);
  config.set('authMethod', jiraConfig.auth.method);

  if (jiraConfig.auth.method === 'api-token') {
    config.set('email', jiraConfig.auth.email);
    config.set('apiToken', jiraConfig.auth.apiToken);
    // Clear OAuth fields
    config.set('accessToken', '');
    config.set('refreshToken', '');
    config.set('expiresAt', 0);
    config.set('cloudId', '');
  } else if (jiraConfig.auth.method === 'oauth') {
    config.set('accessToken', jiraConfig.auth.accessToken);
    config.set('refreshToken', jiraConfig.auth.refreshToken);
    config.set('expiresAt', jiraConfig.auth.expiresAt);
    config.set('cloudId', jiraConfig.auth.cloudId);
    // Clear API token fields
    config.set('email', '');
    config.set('apiToken', '');
  }
}

export function updateOAuthTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): void {
  config.set('accessToken', accessToken);
  config.set('refreshToken', refreshToken);
  config.set('expiresAt', Date.now() + expiresIn * 1000);
}

export function getOAuthClientConfig(): OAuthClientConfig | null {
  const clientId = config.get('oauthClientId');
  const clientSecret = config.get('oauthClientSecret');

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function setOAuthClientConfig(clientConfig: OAuthClientConfig): void {
  config.set('oauthClientId', clientConfig.clientId);
  config.set('oauthClientSecret', clientConfig.clientSecret);
}

export function clearJiraConfig(): void {
  config.delete('jiraHost');
  config.delete('authMethod');
  config.delete('email');
  config.delete('apiToken');
  config.delete('accessToken');
  config.delete('refreshToken');
  config.delete('expiresAt');
  config.delete('cloudId');
  config.delete('oauthClientId');
  config.delete('oauthClientSecret');
}

export function isConfigured(): boolean {
  return getJiraConfig() !== null;
}

export function isOAuthTokenExpired(): boolean {
  const expiresAt = config.get('expiresAt');
  if (!expiresAt) return true;
  // Consider expired 5 minutes before actual expiry
  return Date.now() > expiresAt - 5 * 60 * 1000;
}

export function getActiveTimer(): TimerState | null {
  return config.get('activeTimer');
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

export function maskApiToken(token: string): string {
  if (token.length <= 8) {
    return '****';
  }
  return token.slice(0, 4) + '****' + token.slice(-4);
}
