import {
  type CliRenderer,
  type KeyEvent,
  type InputRenderable,
} from '@opentui/core';
import { spawn } from 'child_process';
import { colors } from './theme.js';
import { Spinner } from './components.js';
import { getJiraConfig, setJiraConfig } from '../services/config.js';
import { initializeJiraClient, isJiraAuthenticationError, testConnection } from '../services/jira.js';
import { Box, Input, Text, clearUI, destroyUI, renderUI } from './react.js';

type ErrorScreenAction = 'retry' | 'quit' | 'reauthenticate';
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

export function clearRenderer(renderer: CliRenderer): void {
  clearUI(renderer);
}

export function showErrorScreen(
  renderer: CliRenderer,
  errorMessage: string,
  allowReauthenticate = false
): Promise<ErrorScreenAction> {
  return new Promise((resolve) => {
    renderer.keyInput.removeAllListeners('keypress');

    const ui = Box(
      {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        padding: 1,
        backgroundColor: colors.bg,
      },
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
        Text({ content: 'JIRA TIME TRACKER', fg: colors.text })
      ),
      Box(
        {
          width: '100%',
          flexGrow: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          borderStyle: 'rounded',
          borderColor: colors.error,
          border: true,
        },
        Text({ content: 'SOMETHING WENT WRONG', fg: colors.error }),
        Text({ content: errorMessage, fg: colors.textMuted }),
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 1,
          },
          ...(allowReauthenticate
            ? [Text({ content: '[a] authenticate again', fg: colors.text })]
            : []),
          Text({ content: '[r] retry', fg: colors.text }),
          Text({ content: '[q] quit', fg: colors.textDim })
        )
      )
    );

    renderUI(renderer, ui);

    renderer.keyInput.on('keypress', (key: KeyEvent) => {
      const keyName = key.name?.toLowerCase();
      if (allowReauthenticate && keyName === 'a') {
        resolve('reauthenticate');
      } else if (keyName === 'r') {
        resolve('retry');
      } else if (keyName === 'q' || keyName === 'escape') {
        resolve('quit');
      }
    });
  });
}

export function showReauthenticationScreen(renderer: CliRenderer): Promise<boolean> {
  return new Promise((resolve) => {
    const previousListeners = renderer.keyInput.listeners('keypress') as Array<(key: KeyEvent) => void>;

    const existingConfig = getJiraConfig();
    if (!existingConfig) {
      resolve(false);
      return;
    }

    let email = existingConfig.auth.email;
    let apiToken = '';
    let statusMessage = '';
    let isError = false;
    let step: 'email' | 'token' | 'testing' = 'email';
    let isResolved = false;

    const finish = (success: boolean) => {
      if (isResolved) return;
      isResolved = true;
      renderer.keyInput.removeAllListeners('keypress');
      for (const listener of previousListeners) {
        renderer.keyInput.on('keypress', listener);
      }
      resolve(success);
    };

    const render = () => {
      const children: ReturnType<typeof Box>[] = [
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
          Text({ content: 'RE-AUTHENTICATE', fg: colors.text })
        ),
      ];

      if (step === 'email') {
        children.push(
          Box(
            { flexDirection: 'column', gap: 1 },
            Text({ content: `Host: ${existingConfig.jiraHost}`, fg: colors.textMuted }),
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
                id: 'reauth-email-input',
                width: '100%',
                value: email,
                placeholder: 'your.email@company.com',
              })
            )
          )
        );
      } else if (step === 'token') {
        children.push(
          Box(
            { flexDirection: 'column', gap: 1 },
            Text({ content: `Host: ${existingConfig.jiraHost}`, fg: colors.textMuted }),
            Text({ content: `Email: ${email}`, fg: colors.textMuted }),
            Text({ content: 'Enter a new Jira API token:', fg: colors.text }),
            Box(
              { flexDirection: 'row', gap: 1 },
              Text({ content: `Create one at: ${API_TOKEN_URL}`, fg: colors.info }),
              Text({
                content: process.platform === 'darwin'
                  ? '[cmd+c/ctrl+y] copy url'
                  : '[alt+c/ctrl+y] copy url',
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
                id: 'reauth-token-input',
                width: '100%',
                value: apiToken,
                placeholder: 'Your API token',
              })
            )
          )
        );
      } else {
        children.push(
          Box(
            { flexDirection: 'row', gap: 1 },
            Text({ content: '...', fg: colors.textMuted }),
            Text({ content: 'testing credentials', fg: colors.textDim })
          )
        );
      }

      if (statusMessage) {
        children.push(
          Box(
            { marginTop: 1 },
            Text({ content: statusMessage, fg: isError ? colors.error : colors.success })
          )
        );
      }

      if (step !== 'testing') {
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

      renderUI(
        renderer,
        Box(
          {
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            padding: 1,
            backgroundColor: colors.bg,
          },
          ...children
        )
      );

      setTimeout(() => {
        const inputId = step === 'email' ? 'reauth-email-input' : step === 'token' ? 'reauth-token-input' : null;
        if (!inputId) return;
        const input = renderer.root.findDescendantById(inputId);
        if (input) {
          input.focus();
        }
      }, 50);
    };

    const testNewCredentials = async () => {
      step = 'testing';
      statusMessage = '';
      isError = false;
      render();

      const nextConfig = {
        jiraHost: existingConfig.jiraHost,
        auth: {
          method: 'api-token' as const,
          email,
          apiToken,
        },
      };

      try {
        initializeJiraClient(nextConfig);
        const connected = await testConnection();

        if (connected) {
          setJiraConfig(nextConfig);
          statusMessage = 'Authentication updated.';
          isError = false;
          render();
          setTimeout(() => finish(true), 700);
          return;
        }

        step = 'token';
        statusMessage = 'Authentication failed. Check your email/token and try again.';
        isError = true;
        render();
      } catch (error) {
        step = 'token';
        statusMessage = `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        isError = true;
        render();
      }
    };

    renderer.keyInput.removeAllListeners('keypress');
    renderer.keyInput.on('keypress', (key: KeyEvent) => {
      if (key.name === 'escape') {
        finish(false);
        return;
      }

      if (step === 'token' && (key.name === 'c' || key.name === 'y')) {
        const isCopyShortcut =
          (key.name === 'c' && (process.platform === 'darwin' ? key.meta : key.option || key.meta))
          || (key.name === 'y' && key.ctrl);
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

      if (key.name !== 'return' && key.name !== 'enter') {
        return;
      }

      if (step === 'email') {
        const input = renderer.root.findDescendantById('reauth-email-input') as InputRenderable | undefined;
        const value = input?.value.trim() ?? '';
        if (!value || !value.includes('@')) {
          statusMessage = 'Please enter a valid email address.';
          isError = true;
          render();
          return;
        }
        email = value;
        statusMessage = '';
        step = 'token';
        render();
        return;
      }

      if (step === 'token') {
        const input = renderer.root.findDescendantById('reauth-token-input') as InputRenderable | undefined;
        const value = input?.value.trim() ?? '';
        if (!value) {
          statusMessage = 'API token is required.';
          isError = true;
          render();
          return;
        }
        apiToken = value;
        void testNewCredentials();
      }
    });

    render();
  });
}

export async function showLoadingScreen<T>(
  renderer: CliRenderer,
  message: string,
  task: () => Promise<T>
): Promise<T> {
  while (true) {
    let spinnerIndex = 0;
    let spinnerInterval: Timer | null = null;

    renderer.keyInput.removeAllListeners('keypress');

    const renderLoading = () => {
      renderUI(
        renderer,
        Box(
          {
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            padding: 1,
            backgroundColor: colors.bg,
          },
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
            Text({ content: 'JIRA TIME TRACKER', fg: colors.text })
          ),
          Box(
            {
              width: '100%',
              flexGrow: 1,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderStyle: 'rounded',
              borderColor: colors.border,
              border: true,
            },
            Spinner(spinnerIndex),
            Box(
              { marginTop: 1 },
              Text({ content: message, fg: colors.textMuted })
            )
          )
        )
      );
    };

    renderLoading();
    spinnerInterval = setInterval(() => {
      spinnerIndex++;
      renderLoading();
    }, 300);

    try {
      const result = await task();
      clearInterval(spinnerInterval);
      return result;
    } catch (error) {
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isAuthError = isJiraAuthenticationError(error);
      const userAction = await showErrorScreen(renderer, errorMessage, isAuthError);
      if (userAction === 'reauthenticate' && isAuthError) {
        const reauthenticated = await showReauthenticationScreen(renderer);
        if (reauthenticated) {
          continue;
        }
      }

      if (userAction === 'retry') {
        continue;
      }

      destroyUI(renderer);
      console.log('\nCancelled.\n');
      process.exit(1);
    }
  }
}
