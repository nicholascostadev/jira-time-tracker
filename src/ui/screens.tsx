import type { CliRenderer } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { spawn } from 'child_process';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JiraConfig } from '../types/index.js';
import { getJiraConfig, setJiraConfig } from '../services/config.js';
import { initializeJiraClient, isJiraAuthenticationError, testConnection } from '../services/jira.js';
import { Spinner } from './components.js';
import { colors } from './theme.js';
import { clearUI, destroyUI, renderUI } from './react.js';

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

function ErrorScreen({
  errorMessage,
  allowReauthenticate,
  onAction,
}: {
  errorMessage: string;
  allowReauthenticate: boolean;
  onAction: (action: ErrorScreenAction) => void;
}) {
  const handleKey = useCallback((key: any) => {
    const keyName = key.name?.toLowerCase();
    if (allowReauthenticate && keyName === 'a') {
      onAction('reauthenticate');
      return;
    }

    if (keyName === 'r') {
      onAction('retry');
      return;
    }

    if (keyName === 'q' || keyName === 'escape') {
      onAction('quit');
    }
  }, [allowReauthenticate, onAction]);

  useKeyboard(handleKey);

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor={colors.bg}>
      <box
        width="100%"
        height={3}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        borderStyle="rounded"
        borderColor={colors.border}
        border
        marginBottom={1}
      >
        <text content="JIRA TIME TRACKER" fg={colors.text} />
      </box>

      <box
        width="100%"
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap={2}
        borderStyle="rounded"
        borderColor={colors.error}
        border
      >
        <text content="SOMETHING WENT WRONG" fg={colors.error} />
        <text content={errorMessage} fg={colors.textMuted} />
        <box flexDirection="row" gap={3} marginTop={1}>
          {allowReauthenticate && <text content="[a] authenticate again" fg={colors.text} />}
          <text content="[r] retry" fg={colors.text} />
          <text content="[q] quit" fg={colors.textDim} />
        </box>
      </box>
    </box>
  );
}

export function showErrorScreen(
  renderer: CliRenderer,
  errorMessage: string,
  allowReauthenticate = false
): Promise<ErrorScreenAction> {
  return new Promise((resolve) => {
    renderUI(
      renderer,
      <ErrorScreen
        errorMessage={errorMessage}
        allowReauthenticate={allowReauthenticate}
        onAction={resolve}
      />
    );
  });
}

function ReauthenticationScreen({ config, onResolve }: { config: JiraConfig; onResolve: (success: boolean) => void }) {
  const [email, setEmail] = useState(config.auth.email);
  const [apiToken, setApiToken] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [step, setStep] = useState<'email' | 'token' | 'testing'>('email');
  const emailInputRef = useRef<any>(null);
  const tokenInputRef = useRef<any>(null);
  const resolvedRef = useRef(false);

  const finish = useCallback((success: boolean) => {
    if (resolvedRef.current) {
      return;
    }

    resolvedRef.current = true;
    onResolve(success);
  }, [onResolve]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (step === 'email') {
        emailInputRef.current?.focus();
      } else if (step === 'token') {
        tokenInputRef.current?.focus();
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [step]);

  const testNewCredentials = useCallback(async () => {
    setStep('testing');
    setStatusMessage('');
    setIsError(false);

    const nextConfig: JiraConfig = {
      jiraHost: config.jiraHost,
      auth: {
        method: 'api-token',
        email,
        apiToken,
      },
    };

    try {
      initializeJiraClient(nextConfig);
      const connected = await testConnection();

      if (connected) {
        setJiraConfig(nextConfig);
        setStatusMessage('Authentication updated.');
        setIsError(false);
        setTimeout(() => finish(true), 700);
        return;
      }

      setStep('token');
      setStatusMessage('Authentication failed. Check your email/token and try again.');
      setIsError(true);
    } catch (error) {
      setStep('token');
      setStatusMessage(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsError(true);
    }
  }, [apiToken, config.jiraHost, email, finish]);

  const handleKey = useCallback((key: any) => {
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
        void copyToClipboard(API_TOKEN_URL)
          .then(() => {
            setStatusMessage('URL copied to clipboard');
            setIsError(false);
          })
          .catch(() => {
            setStatusMessage('Failed to copy URL to clipboard');
            setIsError(true);
          });
        return;
      }
    }

    if (key.name !== 'return' && key.name !== 'enter') {
      return;
    }

    if (step === 'email') {
      const value = email.trim();
      if (!value || !value.includes('@')) {
        setStatusMessage('Please enter a valid email address.');
        setIsError(true);
        return;
      }

      setEmail(value);
      setStatusMessage('');
      setStep('token');
      return;
    }

    if (step === 'token') {
      const value = apiToken.trim();
      if (!value) {
        setStatusMessage('API token is required.');
        setIsError(true);
        return;
      }

      setApiToken(value);
      void testNewCredentials();
    }
  }, [apiToken, email, finish, step, testNewCredentials]);

  useKeyboard(handleKey);

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor={colors.bg}>
      <box
        width="100%"
        height={3}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        borderStyle="rounded"
        borderColor={colors.border}
        border
        marginBottom={1}
      >
        <text content="RE-AUTHENTICATE" fg={colors.text} />
      </box>

      {step === 'email' && (
        <box flexDirection="column" gap={1}>
          <text content={`Host: ${config.jiraHost}`} fg={colors.textMuted} />
          <text content="Enter your Jira email:" fg={colors.text} />
          <box borderStyle="rounded" borderColor={colors.borderFocused} border height={3} width="100%">
            <input
              ref={emailInputRef}
              width="100%"
              value={email}
              placeholder="your.email@company.com"
              onInput={setEmail}
            />
          </box>
        </box>
      )}

      {step === 'token' && (
        <box flexDirection="column" gap={1}>
          <text content={`Host: ${config.jiraHost}`} fg={colors.textMuted} />
          <text content={`Email: ${email}`} fg={colors.textMuted} />
          <text content="Enter a new Jira API token:" fg={colors.text} />
          <box flexDirection="row" gap={1}>
            <text content={`Create one at: ${API_TOKEN_URL}`} fg={colors.info} />
            <text
              content={process.platform === 'darwin' ? '[cmd+c/ctrl+y] copy url' : '[alt+c/ctrl+y] copy url'}
              fg={colors.textDim}
            />
          </box>
          <box borderStyle="rounded" borderColor={colors.borderFocused} border height={3} width="100%">
            <input
              ref={tokenInputRef}
              width="100%"
              value={apiToken}
              placeholder="Your API token"
              onInput={setApiToken}
            />
          </box>
        </box>
      )}

      {step === 'testing' && (
        <box flexDirection="row" gap={1}>
          <text content="..." fg={colors.textMuted} />
          <text content="testing credentials" fg={colors.textDim} />
        </box>
      )}

      {statusMessage && (
        <box marginTop={1}>
          <text content={statusMessage} fg={isError ? colors.error : colors.success} />
        </box>
      )}

      {step !== 'testing' && (
        <box flexDirection="row" gap={3} marginTop={2}>
          <text content="[enter] confirm" fg={colors.textDim} />
          <text content="[esc] cancel" fg={colors.textDim} />
        </box>
      )}
    </box>
  );
}

export function showReauthenticationScreen(renderer: CliRenderer): Promise<boolean> {
  const existingConfig = getJiraConfig();
  if (!existingConfig) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    renderUI(renderer, <ReauthenticationScreen config={existingConfig} onResolve={resolve} />);
  });
}

function LoadingScreen({ message }: { message: string }) {
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setSpinnerIndex((current) => current + 1);
    }, 300);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor={colors.bg}>
      <box
        width="100%"
        height={3}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        borderStyle="rounded"
        borderColor={colors.border}
        border
        marginBottom={1}
      >
        <text content="JIRA TIME TRACKER" fg={colors.text} />
      </box>

      <box
        width="100%"
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        borderStyle="rounded"
        borderColor={colors.border}
        border
      >
        <Spinner frameIndex={spinnerIndex} />
        <box marginTop={1}>
          <text content={message} fg={colors.textMuted} />
        </box>
      </box>
    </box>
  );
}

export async function showLoadingScreen<T>(
  renderer: CliRenderer,
  message: string,
  task: () => Promise<T>
): Promise<T> {
  while (true) {
    renderUI(renderer, <LoadingScreen message={message} />);

    try {
      return await task();
    } catch (error) {
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
