import type { CliRenderer } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { spawn } from 'child_process';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JiraConfig } from '../types/index.js';
import { getConfigPath, setJiraConfig } from '../services/config.js';
import { initializeJiraClient, testConnection } from '../services/jira.js';
import { colors } from './theme.js';
import { renderUI } from './react.js';

type ConfigStep = 'jira-host' | 'email' | 'api-token' | 'testing' | 'done';

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

function ConfigWizard({
  existingConfig,
  onExit,
}: {
  existingConfig: JiraConfig | null;
  onExit: (success: boolean) => void;
}) {
  const [currentStep, setCurrentStep] = useState<ConfigStep>('jira-host');
  const [jiraHost, setJiraHost] = useState(existingConfig?.jiraHost ?? '');
  const [email, setEmail] = useState(existingConfig?.auth.email ?? '');
  const [apiToken, setApiToken] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const hostInputRef = useRef<any>(null);
  const emailInputRef = useRef<any>(null);
  const tokenInputRef = useRef<any>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentStep === 'jira-host') {
        hostInputRef.current?.focus();
      } else if (currentStep === 'email') {
        emailInputRef.current?.focus();
      } else if (currentStep === 'api-token') {
        tokenInputRef.current?.focus();
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [currentStep]);

  const processApiTokenFlow = useCallback(async () => {
    setCurrentStep('testing');

    try {
      const config: JiraConfig = {
        jiraHost,
        auth: {
          method: 'api-token',
          email,
          apiToken,
        },
      };

      initializeJiraClient(config);
      const connected = await testConnection();

      if (connected) {
        setJiraConfig(config);
        setStatusMessage('Configuration saved successfully!');
        setIsError(false);
      } else {
        setStatusMessage('Connection failed. Please check your credentials.');
        setIsError(true);
      }
    } catch (error) {
      setStatusMessage(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsError(true);
    }

    setCurrentStep('done');
  }, [apiToken, email, jiraHost]);

  const submitCurrentStep = useCallback(() => {
    if (currentStep === 'done') {
      onExit(true);
      return;
    }

    if (currentStep === 'jira-host') {
      const value = jiraHost.trim();
      if (!value) {
        setStatusMessage('Jira host is required');
        setIsError(true);
        return;
      }

      if (!value.startsWith('https://')) {
        setStatusMessage('Jira host must start with https://');
        setIsError(true);
        return;
      }

      setJiraHost(value.replace(/\/$/, ''));
      setStatusMessage('');
      setCurrentStep('email');
      return;
    }

    if (currentStep === 'email') {
      const value = email.trim();
      if (!value || !value.includes('@')) {
        setStatusMessage('Please enter a valid email address');
        setIsError(true);
        return;
      }

      setEmail(value);
      setStatusMessage('');
      setCurrentStep('api-token');
      return;
    }

    if (currentStep === 'api-token') {
      const value = apiToken.trim();
      if (!value) {
        setStatusMessage('API token is required');
        setIsError(true);
        return;
      }

      setApiToken(value);
      setStatusMessage('');
      void processApiTokenFlow();
    }
  }, [apiToken, currentStep, email, jiraHost, onExit, processApiTokenFlow]);

  const handleKey = useCallback((key: any) => {
    if (key.name === 'escape') {
      onExit(false);
      return;
    }

    if (currentStep === 'done') {
      onExit(true);
      return;
    }

    if (currentStep === 'api-token' && key.name === 'c') {
      const isCopyShortcut = process.platform === 'darwin' ? key.meta : key.option || key.meta;
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

    if (key.name === 'return' || key.name === 'enter') {
      submitCurrentStep();
    }
  }, [currentStep, onExit, submitCurrentStep]);

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
        <text content="API TOKEN CONFIGURATION" fg={colors.text} />
      </box>

      {existingConfig && currentStep === 'jira-host' && (
        <box flexDirection="row" gap={1} marginBottom={1}>
          <text content="!" fg={colors.warning} />
          <text content="Existing configuration found. This will overwrite it." fg={colors.warning} />
        </box>
      )}

      {currentStep === 'jira-host' && (
        <box flexDirection="column" gap={1}>
          <text content="Enter your Jira host URL (e.g., https://yourcompany.atlassian.net):" fg={colors.text} />
          <box borderStyle="rounded" borderColor={colors.borderFocused} border height={3} width="100%">
            <input
              ref={hostInputRef}
              width="100%"
              value={jiraHost}
              placeholder="https://yourcompany.atlassian.net"
              onInput={setJiraHost}
            />
          </box>
        </box>
      )}

      {currentStep === 'email' && (
        <box flexDirection="column" gap={1}>
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

      {currentStep === 'api-token' && (
        <box flexDirection="column" gap={1}>
          <text content="Enter your Jira API token:" fg={colors.text} />
          <box flexDirection="row" gap={1}>
            <text content={`Create one at: ${API_TOKEN_URL}`} fg={colors.info} />
            <text
              content={process.platform === 'darwin' ? '[cmd+c] copy url' : '[alt+c] copy url'}
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

      {currentStep === 'testing' && (
        <box flexDirection="row" gap={1}>
          <text content="..." fg={colors.textMuted} />
          <text content="testing connection" fg={colors.textDim} />
        </box>
      )}

      {currentStep === 'done' && (
        <box flexDirection="column" gap={1}>
          <text content={statusMessage} fg={isError ? colors.error : colors.success} />
          <text content={`Config file: ${getConfigPath()}`} fg={colors.textMuted} />
          <text content="press any key to exit" fg={colors.textDim} />
        </box>
      )}

      {statusMessage && currentStep !== 'done' && (
        <box marginTop={1}>
          <text content={statusMessage} fg={isError ? colors.error : colors.success} />
        </box>
      )}

      {currentStep !== 'testing' && currentStep !== 'done' && (
        <box flexDirection="row" gap={3} marginTop={2}>
          <text content="[enter] confirm" fg={colors.textDim} />
          <text content="[esc] cancel" fg={colors.textDim} />
        </box>
      )}
    </box>
  );
}

export async function runInteractiveConfigWizard(
  renderer: CliRenderer,
  existingConfig: JiraConfig | null,
): Promise<boolean> {
  return new Promise((resolve) => {
    renderUI(renderer, <ConfigWizard existingConfig={existingConfig} onExit={resolve} />);
  });
}
