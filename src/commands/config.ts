import { createCliRenderer } from '@opentui/core';
import {
  clearJiraConfig,
  getConfigPath,
  getDefaultWorklogMessage,
  getJiraConfig,
  maskApiToken,
  setDefaultWorklogMessage,
} from '../services/config.js';
import { runInteractiveConfigWizard } from '../ui/config-wizard.js';
import { destroyUI } from '../ui/react.js';
import { colors } from '../ui/theme.js';

interface ConfigOptions {
  show?: boolean;
  clear?: boolean;
  defaultMessage?: string;
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

  let renderer;
  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: true,
      backgroundColor: colors.bg,
    });
  } catch (error) {
    console.error('Failed to initialize UI:', error);
    process.exit(1);
  }

  const success = await runInteractiveConfigWizard(renderer, existingConfig);
  destroyUI(renderer);

  if (!success) {
    console.log('\nConfiguration cancelled.\n');
  }

  drainAndExit(success ? 0 : 1);
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
      } catch {
        // noop
      }
      process.stdin.pause();
      process.exit(code);
    }, 200);
  } catch {
    process.exit(code);
  }
}
