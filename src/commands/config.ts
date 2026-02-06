import {
  createCliRenderer,
  Box,
  Text,
  Input,
  Select,
  t,
  bold,
  fg,
  type CliRenderer,
  type KeyEvent,
  InputRenderableEvents,
  SelectRenderableEvents,
  type InputRenderable,
  type SelectRenderable,
} from '@opentui/core';
import {
  getJiraConfig,
  setJiraConfig,
  clearJiraConfig,
  getConfigPath,
  maskApiToken,
  setOAuthClientConfig,
  getOAuthClientConfig,
} from '../services/config.js';
import { initializeJiraClient, testConnection } from '../services/jira.js';
import { startOAuthFlow, getCallbackUrl } from '../services/oauth.js';
import type { AuthMethod, JiraCloudResource } from '../types/index.js';
import { colors } from '../ui/theme.js';
import { spawn } from 'child_process';

const API_TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === 'darwin') {
      cmd = 'pbcopy';
      args = [];
    } else if (platform === 'win32') {
      cmd = 'clip';
      args = [];
    } else {
      cmd = 'xclip';
      args = ['-selection', 'clipboard'];
    }

    const proc = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    proc.stdin?.write(text);
    proc.stdin?.end();
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Failed to copy'))));
    proc.on('error', reject);
  });
}

interface ConfigOptions {
  show?: boolean;
  clear?: boolean;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  if (options.show) {
    showConfig();
    return;
  }

  if (options.clear) {
    clearConfig();
    return;
  }

  await interactiveConfig();
}

function showConfig(): void {
  const config = getJiraConfig();

  console.log();
  console.log('\x1b[1mjira time tracker configuration\x1b[0m');
  console.log('\x1b[90m────────────────────────────────\x1b[0m');
  console.log();

  if (!config) {
    console.log('\x1b[90mNot configured. Run "jtt config" to set up.\x1b[0m');
  } else {
    console.log(`\x1b[90mhost\x1b[0m  ${config.jiraHost}`);
    console.log(`\x1b[90mauth\x1b[0m  ${config.auth.method}`);

    if (config.auth.method === 'api-token') {
      console.log(`\x1b[90memail\x1b[0m ${config.auth.email}`);
      console.log(`\x1b[90mtoken\x1b[0m ${maskApiToken(config.auth.apiToken)}`);
    } else if (config.auth.method === 'oauth') {
      console.log(`\x1b[90mcloud\x1b[0m ${config.auth.cloudId}`);
      console.log(
        `\x1b[90mtoken\x1b[0m ${config.auth.accessToken ? 'configured' : 'not set'}`
      );
    }
  }

  console.log();
  console.log(`\x1b[90m${getConfigPath()}\x1b[0m`);
  console.log();
}

function clearConfig(): void {
  clearJiraConfig();
  console.log();
  console.log('+ configuration cleared');
  console.log();
}

type ConfigStep = 'auth-method' | 'jira-host' | 'email' | 'api-token' | 'testing' | 'oauth-client-id' | 'oauth-client-secret' | 'oauth-flow' | 'site-select' | 'done';

async function interactiveConfig(): Promise<void> {
  const existingConfig = getJiraConfig();
  
  let renderer: CliRenderer;
  let currentStep: ConfigStep = 'auth-method';
  let authMethod: AuthMethod = 'api-token';
  let jiraHost = existingConfig?.jiraHost || '';
  let email = existingConfig?.auth.method === 'api-token' ? existingConfig.auth.email : '';
  let apiToken = '';
  let oauthClientId = getOAuthClientConfig()?.clientId || '';
  let oauthClientSecret = '';
  let statusMessage = '';
  let isError = false;
  let availableSites: JiraCloudResource[] = [];
  let siteSelectResolver: ((site: JiraCloudResource | null) => void) | null = null;

  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: true,
      useAlternateScreen: true,
      backgroundColor: colors.bg,
    });
  } catch (error) {
    console.error('Failed to initialize UI:', error);
    process.exit(1);
  }

  const cleanup = (success: boolean = false) => {
    renderer.destroy();
    if (!success) {
      console.log('\nConfiguration cancelled.\n');
    }
    drainAndExit(success ? 0 : 1);
  };

  const buildUI = () => {
    const children: ReturnType<typeof Box>[] = [];

    // Header - minimal
    children.push(
      Box(
        {
          width: '100%',
          height: 3,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderStyle: 'rounded',
          borderColor: colors.border,
          border: true,
          marginBottom: 1,
        },
        Text({
          content: t`${bold(fg(colors.text)('CONFIGURATION'))}`,
        })
      )
    );

    // Warning if existing config
    if (existingConfig && currentStep === 'auth-method') {
      children.push(
        Box(
          {
            flexDirection: 'row',
            gap: 1,
            marginBottom: 1,
          },
          Text({
            content: '!',
            fg: colors.warning,
          }),
          Text({
            content: 'Existing configuration found. This will overwrite it.',
            fg: colors.warning,
          })
        )
      );
    }

    // Current step content
    switch (currentStep) {
      case 'auth-method':
        children.push(
          Box(
            {
              flexDirection: 'column',
              borderStyle: 'rounded',
              borderColor: colors.border,
              border: true,
              padding: 1,
              title: ' Select Authentication Method ',
            },
            Select({
              id: 'auth-method-select',
              width: '100%',
              height: 6,
              options: [
                { name: 'API Token', description: 'recommended for personal use', value: 'api-token' },
                { name: 'OAuth 2.0', description: 'recommended for shared/team use', value: 'oauth' },
              ],
              backgroundColor: colors.bg,
              textColor: colors.text,
              focusedBackgroundColor: colors.bg,
              focusedTextColor: colors.text,
              selectedBackgroundColor: colors.text,
              selectedTextColor: colors.bg,
              descriptionColor: colors.textDim,
              selectedDescriptionColor: colors.bgHighlight,
            })
          )
        );
        break;

      case 'jira-host':
        children.push(
          Box(
            {
              flexDirection: 'column',
              gap: 1,
            },
            Text({
              content: 'Enter your Jira host URL (e.g., https://yourcompany.atlassian.net):',
              fg: colors.text,
            }),
            Box(
              {
                borderStyle: 'rounded',
                borderColor: colors.borderFocused,
                border: true,
                height: 3,
                width: '100%',
              },
              Input({
                id: 'jira-host-input',
                width: '100%',
                value: jiraHost,
                placeholder: 'https://yourcompany.atlassian.net',
              })
            )
          )
        );
        break;

      case 'email':
        children.push(
          Box(
            {
              flexDirection: 'column',
              gap: 1,
            },
            Text({
              content: 'Enter your Jira email:',
              fg: colors.text,
            }),
            Box(
              {
                borderStyle: 'rounded',
                borderColor: colors.borderFocused,
                border: true,
                height: 3,
                width: '100%',
              },
              Input({
                id: 'email-input',
                width: '100%',
                value: email,
                placeholder: 'your.email@company.com',
                
              })
            )
          )
        );
        break;

      case 'api-token':
        children.push(
          Box(
            {
              flexDirection: 'column',
              gap: 1,
            },
            Text({
              content: 'Enter your Jira API token:',
              fg: colors.text,
            }),
            Box(
              {
                flexDirection: 'row',
                gap: 1,
              },
              Text({
                content: `Create one at: ${API_TOKEN_URL}`,
                fg: colors.info,
              }),
              Text({
                content: process.platform === 'darwin' ? '[cmd+c] copy url' : '[alt+c] copy url',
                fg: colors.textDim,
              })
            ),
            Box(
              {
                borderStyle: 'rounded',
                borderColor: colors.borderFocused,
                border: true,
                height: 3,
                width: '100%',
              },
              Input({
                id: 'api-token-input',
                width: '100%',
                value: apiToken,
                placeholder: 'Your API token',
                
              })
            )
          )
        );
        break;

      case 'oauth-client-id':
        children.push(
          Box(
            {
              flexDirection: 'column',
              gap: 1,
            },
            Text({
              content: 'oauth 2.0 setup',
              fg: colors.text,
            }),
            Text({
              content: '1. Go to: https://developer.atlassian.com/console/myapps/',
              fg: colors.textMuted,
            }),
            Text({
              content: '2. Create an OAuth 2.0 integration',
              fg: colors.textMuted,
            }),
            Text({
              content: `3. Add callback URL: ${getCallbackUrl()}`,
              fg: colors.textMuted,
            }),
            Text({
              content: '4. Add scopes: read:jira-user, read:jira-work, write:jira-work',
              fg: colors.textMuted,
            }),
            Text({
              content: '',
              fg: colors.text,
            }),
            Text({
              content: 'Enter your OAuth Client ID:',
              fg: colors.text,
            }),
            Box(
              {
                borderStyle: 'rounded',
                borderColor: colors.borderFocused,
                border: true,
                height: 3,
                width: '100%',
              },
              Input({
                id: 'oauth-client-id-input',
                width: '100%',
                value: oauthClientId,
                placeholder: 'Client ID',
                
              })
            )
          )
        );
        break;

      case 'oauth-client-secret':
        children.push(
          Box(
            {
              flexDirection: 'column',
              gap: 1,
            },
            Text({
              content: 'Enter your OAuth Client Secret:',
              fg: colors.text,
            }),
            Box(
              {
                borderStyle: 'rounded',
                borderColor: colors.borderFocused,
                border: true,
                height: 3,
                width: '100%',
              },
              Input({
                id: 'oauth-client-secret-input',
                width: '100%',
                value: oauthClientSecret,
                placeholder: 'Client Secret',
                
              })
            )
          )
        );
        break;

      case 'testing':
        children.push(
          Box(
            {
              flexDirection: 'row',
              gap: 1,
            },
            Text({
              content: '...',
              fg: colors.textMuted,
            }),
            Text({
              content: 'testing connection',
              fg: colors.textDim,
            })
          )
        );
        break;

      case 'oauth-flow':
        children.push(
          Box(
            {
              flexDirection: 'column',
              gap: 1,
            },
            Text({
              content: 'opening browser for authorization',
              fg: colors.text,
            }),
            Text({
              content: 'please authorize the app in your browser',
              fg: colors.textMuted,
            }),
            Box(
              {
                flexDirection: 'row',
                gap: 1,
                marginTop: 1,
              },
              Text({
                content: '...',
                fg: colors.textMuted,
              }),
              Text({
                content: 'waiting for authorization',
                fg: colors.textDim,
              })
            )
          )
        );
        break;

      case 'site-select':
        children.push(
          Box(
            {
              flexDirection: 'column',
              borderStyle: 'rounded',
              borderColor: colors.border,
              border: true,
              padding: 1,
              title: ' Select Jira Site ',
            },
            Text({
              content: `${availableSites.length} Jira sites found. Choose one:`,
              fg: colors.textMuted,
              id: 'site-select-label',
            }),
            Select({
              id: 'site-select',
              width: '100%',
              height: Math.min(availableSites.length * 2 + 2, 16),
              options: availableSites.map((site) => ({
                name: site.name,
                description: site.url,
                value: site.id,
              })),
              backgroundColor: colors.bg,
              textColor: colors.text,
              focusedBackgroundColor: colors.bg,
              focusedTextColor: colors.text,
              selectedBackgroundColor: colors.text,
              selectedTextColor: colors.bg,
              descriptionColor: colors.textDim,
              selectedDescriptionColor: colors.bgHighlight,
            })
          )
        );
        break;

      case 'done':
        children.push(
          Box(
            {
              flexDirection: 'column',
              gap: 1,
            },
            Text({
              content: statusMessage,
              fg: isError ? colors.error : colors.success,
            }),
            Text({
              content: `Config file: ${getConfigPath()}`,
              fg: colors.textMuted,
            }),
            Text({
              content: 'press any key to exit',
              fg: colors.textDim,
            })
          )
        );
        break;
    }

    // Status message if any
    if (statusMessage && currentStep !== 'done') {
      children.push(
        Box(
          {
            marginTop: 1,
          },
          Text({
            content: statusMessage,
            fg: isError ? colors.error : colors.success,
          })
        )
      );
    }

    // Footer hints - minimal
    if (currentStep !== 'testing' && currentStep !== 'oauth-flow' && currentStep !== 'done' && currentStep !== 'site-select') {
      children.push(
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 2,
          },
          Text({
            content: '[enter] confirm',
            fg: colors.textDim,
          }),
          Text({
            content: '[esc] cancel',
            fg: colors.textDim,
          })
        )
      );
    }

    return Box(
      {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        padding: 1,
        backgroundColor: colors.bg,
      },
      ...children
    );
  };

  const render = () => {
    // Clear existing children
    while (renderer.root.getChildrenCount() > 0) {
      const children = renderer.root.getChildren();
      if (children.length > 0) {
        renderer.root.remove(children[0].id);
      }
    }

    const ui = buildUI();
    renderer.root.add(ui);

    // Focus the appropriate input
    setTimeout(() => {
      let elementId: string | null = null;
      switch (currentStep) {
        case 'auth-method':
          elementId = 'auth-method-select';
          break;
        case 'jira-host':
          elementId = 'jira-host-input';
          break;
        case 'email':
          elementId = 'email-input';
          break;
        case 'api-token':
          elementId = 'api-token-input';
          break;
        case 'oauth-client-id':
          elementId = 'oauth-client-id-input';
          break;
        case 'oauth-client-secret':
          elementId = 'oauth-client-secret-input';
          break;
        case 'site-select':
          elementId = 'site-select';
          break;
      }
      if (elementId) {
        const element = renderer.root.findDescendantById(elementId);
        if (element) {
          element.focus();
        }
      }
    }, 50);
  };

  const processApiTokenFlow = async () => {
    currentStep = 'testing';
    render();

    try {
      const config = {
        jiraHost,
        auth: {
          method: 'api-token' as const,
          email,
          apiToken,
        },
      };

      initializeJiraClient(config);

      const isConnected = await testConnection();

      if (isConnected) {
        setJiraConfig(config);
        statusMessage = 'Configuration saved successfully!';
        isError = false;
      } else {
        statusMessage = 'Connection failed. Please check your credentials.';
        isError = true;
      }
    } catch (error) {
      statusMessage = `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      isError = true;
    }

    currentStep = 'done';
    render();

    // Wait for user keypress to exit (avoids setTimeout + process.exit race)
    renderer.keyInput.removeAllListeners('keypress');
    renderer.keyInput.on('keypress', () => cleanup(true));
  };

  const processOAuthFlow = async () => {
    currentStep = 'oauth-flow';
    render();

    setOAuthClientConfig({
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
    });

    try {
      const result = await startOAuthFlow({
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
        siteSelector: async (sites) => {
          availableSites = sites;
          currentStep = 'site-select';
          render();

          return new Promise<JiraCloudResource | null>((resolveSite) => {
            siteSelectResolver = resolveSite;
          });
        },
      });

      const config = {
        jiraHost: result.siteUrl,
        auth: {
          method: 'oauth' as const,
          accessToken: result.tokens.access_token,
          refreshToken: result.tokens.refresh_token,
          expiresAt: Date.now() + result.tokens.expires_in * 1000,
          cloudId: result.cloudId,
        },
      };

      setJiraConfig(config);
      statusMessage = `Connected to: ${result.siteName}. Configuration saved!`;
      isError = false;
    } catch (error) {
      statusMessage = `Authorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      isError = true;
    }

    currentStep = 'done';
    render();

    // Wait for user keypress to exit (avoids setTimeout + process.exit race)
    renderer.keyInput.removeAllListeners('keypress');
    renderer.keyInput.on('keypress', () => cleanup(true));
  };

  // Handle input submission
  const handleSubmit = (inputId: string, value: string) => {
    switch (inputId) {
      case 'jira-host-input':
        if (!value.trim()) {
          statusMessage = 'Jira host is required';
          isError = true;
          render();
          return;
        }
        if (!value.startsWith('https://')) {
          statusMessage = 'Jira host must start with https://';
          isError = true;
          render();
          return;
        }
        jiraHost = value.trim().replace(/\/$/, '');
        statusMessage = '';
        currentStep = 'email';
        render();
        break;

      case 'email-input':
        if (!value.trim() || !value.includes('@')) {
          statusMessage = 'Please enter a valid email address';
          isError = true;
          render();
          return;
        }
        email = value.trim();
        statusMessage = '';
        currentStep = 'api-token';
        render();
        break;

      case 'api-token-input':
        if (!value.trim()) {
          statusMessage = 'API token is required';
          isError = true;
          render();
          return;
        }
        apiToken = value.trim();
        statusMessage = '';
        processApiTokenFlow();
        break;

      case 'oauth-client-id-input':
        if (!value.trim()) {
          statusMessage = 'Client ID is required';
          isError = true;
          render();
          return;
        }
        oauthClientId = value.trim();
        statusMessage = '';
        currentStep = 'oauth-client-secret';
        render();
        break;

      case 'oauth-client-secret-input':
        if (!value.trim()) {
          statusMessage = 'Client Secret is required';
          isError = true;
          render();
          return;
        }
        oauthClientSecret = value.trim();
        statusMessage = '';
        processOAuthFlow();
        break;
    }
  };

  // Set up event listeners
  renderer.keyInput.on('keypress', (key: KeyEvent) => {
    if (key.name === 'escape') {
      cleanup(false);
      return;
    }

    // Copy API token URL: Cmd+C on Mac, Alt+C on other platforms
    if (currentStep === 'api-token' && key.name === 'c') {
      const isCopyShortcut =
        process.platform === 'darwin' ? key.meta : key.option || key.meta;

      if (isCopyShortcut) {
        key.preventDefault();
        key.stopPropagation();
        copyToClipboard(API_TOKEN_URL)
          .then(() => {
            statusMessage = 'URL copied to clipboard';
            isError = false;
            render();
          })
          .catch(() => {
            statusMessage = 'Failed to copy URL to clipboard';
            isError = true;
            render();
          });
        return;
      }
    }

    if (key.name === 'return' || key.name === 'enter') {
      if (currentStep === 'auth-method') {
        const select = renderer.root.findDescendantById('auth-method-select') as SelectRenderable;
        if (select) {
          const option = select.getSelectedOption();
          authMethod = option?.value || 'api-token';
          statusMessage = '';
          if (authMethod === 'api-token') {
            currentStep = 'jira-host';
          } else {
            currentStep = 'oauth-client-id';
          }
          render();
        }
        return;
      }

      if (currentStep === 'site-select') {
        const select = renderer.root.findDescendantById('site-select') as SelectRenderable;
        if (select && siteSelectResolver) {
          const option = select.getSelectedOption();
          const site = availableSites.find((s) => s.id === option?.value);
          siteSelectResolver(site ?? null);
          siteSelectResolver = null;
        }
        return;
      }

      // For input fields, get the value and process
      const inputIds = ['jira-host-input', 'email-input', 'api-token-input', 'oauth-client-id-input', 'oauth-client-secret-input'];
      for (const inputId of inputIds) {
        const input = renderer.root.findDescendantById(inputId) as InputRenderable | undefined;
        if (input?.focused) {
          handleSubmit(inputId, input.value);
          return;
        }
      }
    }

    if (currentStep === 'done' && key.name === 'return') {
      cleanup(true);
    }
  });

  // Initial render
  render();
  renderer.start();
}

function drainAndExit(code: number): void {
  if (!process.stdin.isTTY) { process.exit(code); return; }
  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => {});
    setTimeout(() => {
      try { process.stdin.setRawMode(false); } catch {}
      process.stdin.pause();
      process.exit(code);
    }, 200);
  } catch { process.exit(code); }
}
