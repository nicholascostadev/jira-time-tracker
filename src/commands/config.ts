import {
  createCliRenderer,
  Box,
  Text,
  Input,
  t,
  bold,
  fg,
  type CliRenderer,
  type InputRenderable,
  type KeyEvent,
} from '@opentui/core';
import {
  getJiraConfig,
  setJiraConfig,
  clearJiraConfig,
  getConfigPath,
  maskApiToken,
  getDefaultWorklogMessage,
  setDefaultWorklogMessage,
} from '../services/config.js';
import { initializeJiraClient, testConnection } from '../services/jira.js';
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
  defaultMessage?: string;
}

type ConfigStep = 'jira-host' | 'email' | 'api-token' | 'testing' | 'done';

export async function configCommand(options: ConfigOptions): Promise<void> {
  if (options.show) {
    showConfig();
    return;
  }

  if (options.clear) {
    clearConfig();
    return;
  }

  if (options.defaultMessage !== undefined) {
    setDefaultMessage(options.defaultMessage);
    return;
  }

  await interactiveConfig();
}

function showConfig(): void {
  const config = getJiraConfig();
  const defaultMsg = getDefaultWorklogMessage();

  console.log();
  console.log('\x1b[1mjira time tracker configuration\x1b[0m');
  console.log('\x1b[90m────────────────────────────────\x1b[0m');
  console.log();

  if (!config) {
    console.log('\x1b[90mNot configured. Run "jtt config" to set up.\x1b[0m');
  } else {
    console.log(`\x1b[90mhost\x1b[0m     ${config.jiraHost}`);
    console.log('\x1b[90mauth\x1b[0m     api-token');
    console.log(`\x1b[90memail\x1b[0m    ${config.auth.email}`);
    console.log(`\x1b[90mtoken\x1b[0m    ${maskApiToken(config.auth.apiToken)}`);
    console.log(`\x1b[90mdefault\x1b[0m  ${defaultMsg || '\x1b[90m(not set)\x1b[0m'}`);
  }

  console.log();
  console.log(`\x1b[90m${getConfigPath()}\x1b[0m`);
  console.log();
}

function setDefaultMessage(message: string): void {
  const trimmed = message.trim();
  setDefaultWorklogMessage(trimmed);
  console.log();
  if (trimmed) {
    console.log(`+ default worklog message set to: "${trimmed}"`);
  } else {
    console.log('+ default worklog message cleared');
  }
  console.log();
}

function clearConfig(): void {
  clearJiraConfig();
  console.log();
  console.log('+ configuration cleared');
  console.log();
}

async function interactiveConfig(): Promise<void> {
  const existingConfig = getJiraConfig();

  let renderer: CliRenderer;
  let currentStep: ConfigStep = 'jira-host';
  let jiraHost = existingConfig?.jiraHost || '';
  let email = existingConfig?.auth.email || '';
  let apiToken = '';
  let statusMessage = '';
  let isError = false;

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

  const cleanup = (success = false) => {
    renderer.destroy();
    if (!success) {
      console.log('\nConfiguration cancelled.\n');
    }
    drainAndExit(success ? 0 : 1);
  };

  const buildUI = () => {
    const children: ReturnType<typeof Box>[] = [];

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
          content: t`${bold(fg(colors.text)('API TOKEN CONFIGURATION'))}`,
        })
      )
    );

    if (existingConfig && currentStep === 'jira-host') {
      children.push(
        Box(
          {
            flexDirection: 'row',
            gap: 1,
            marginBottom: 1,
          },
          Text({ content: '!', fg: colors.warning }),
          Text({
            content: 'Existing configuration found. This will overwrite it.',
            fg: colors.warning,
          })
        )
      );
    }

    switch (currentStep) {
      case 'jira-host':
        children.push(
          Box(
            { flexDirection: 'column', gap: 1 },
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
            { flexDirection: 'column', gap: 1 },
            Text({ content: 'Enter your Jira email:', fg: colors.text }),
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
            { flexDirection: 'column', gap: 1 },
            Text({ content: 'Enter your Jira API token:', fg: colors.text }),
            Box(
              { flexDirection: 'row', gap: 1 },
              Text({ content: `Create one at: ${API_TOKEN_URL}`, fg: colors.info }),
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

      case 'testing':
        children.push(
          Box(
            { flexDirection: 'row', gap: 1 },
            Text({ content: '...', fg: colors.textMuted }),
            Text({ content: 'testing connection', fg: colors.textDim })
          )
        );
        break;

      case 'done':
        children.push(
          Box(
            { flexDirection: 'column', gap: 1 },
            Text({ content: statusMessage, fg: isError ? colors.error : colors.success }),
            Text({ content: `Config file: ${getConfigPath()}`, fg: colors.textMuted }),
            Text({ content: 'press any key to exit', fg: colors.textDim })
          )
        );
        break;
    }

    if (statusMessage && currentStep !== 'done') {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ content: statusMessage, fg: isError ? colors.error : colors.success })
        )
      );
    }

    if (currentStep !== 'testing' && currentStep !== 'done') {
      children.push(
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 2,
          },
          Text({ content: '[enter] confirm', fg: colors.textDim }),
          Text({ content: '[esc] cancel', fg: colors.textDim })
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
    while (renderer.root.getChildrenCount() > 0) {
      const children = renderer.root.getChildren();
      if (children.length > 0) {
        renderer.root.remove(children[0].id);
      }
    }

    renderer.root.add(buildUI());

    setTimeout(() => {
      const inputMap: Record<ConfigStep, string | null> = {
        'jira-host': 'jira-host-input',
        'email': 'email-input',
        'api-token': 'api-token-input',
        'testing': null,
        'done': null,
      };

      const elementId = inputMap[currentStep];
      if (!elementId) return;

      const element = renderer.root.findDescendantById(elementId);
      if (element) {
        element.focus();
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
    renderer.keyInput.removeAllListeners('keypress');
    renderer.keyInput.on('keypress', () => cleanup(true));
  };

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
        return;

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
        return;

      case 'api-token-input':
        if (!value.trim()) {
          statusMessage = 'API token is required';
          isError = true;
          render();
          return;
        }
        apiToken = value.trim();
        statusMessage = '';
        void processApiTokenFlow();
        return;
    }
  };

  renderer.keyInput.on('keypress', (key: KeyEvent) => {
    if (key.name === 'escape') {
      cleanup(false);
      return;
    }

    if (currentStep === 'api-token' && key.name === 'c') {
      const isCopyShortcut = process.platform === 'darwin' ? key.meta : key.option || key.meta;
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
      if (currentStep === 'done') {
        cleanup(true);
        return;
      }

      const inputIds = ['jira-host-input', 'email-input', 'api-token-input'];
      for (const inputId of inputIds) {
        const input = renderer.root.findDescendantById(inputId) as InputRenderable | undefined;
        if (input?.focused) {
          handleSubmit(inputId, input.value);
          return;
        }
      }
    }
  });

  render();
  renderer.start();
}

function drainAndExit(code: number): void {
  if (!process.stdin.isTTY) {
    process.exit(code);
    return;
  }

  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => {});
    setTimeout(() => {
      try {
        process.stdin.setRawMode(false);
      } catch {}
      process.stdin.pause();
      process.exit(code);
    }, 200);
  } catch {
    process.exit(code);
  }
}
