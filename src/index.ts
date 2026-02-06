#!/usr/bin/env node

import { Command } from 'commander';
import { configCommand } from './commands/config.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { resumeCommand } from './commands/resume.js';
import { updateCommand } from './commands/update.js';
import { VERSION } from './version.js';

const program = new Command();

program
  .name('jtt')
  .description('CLI tool for tracking time and logging worklogs to Jira')
  .version(VERSION);

program
  .command('config')
  .description('Configure Jira credentials')
  .option('-s, --show', 'Show current configuration')
  .option('-c, --clear', 'Clear stored configuration')
  .option('--default-message <message>', 'Set the default worklog message (use "" to clear)')
  .action(configCommand);

program
  .command('start [issue-key]')
  .description('Start tracking time for a Jira issue (shows assigned issues if no key provided)')
  .option('-d, --description <description>', 'Pre-fill the worklog description (prompted when stopping)')
  .action(startCommand);

program
  .command('status')
  .description('Show current timer status')
  .action(statusCommand);

program
  .command('resume')
  .description('Resume an existing timer session')
  .action(resumeCommand);

program
  .command('update')
  .description('Update jtt to the latest GitHub release binary')
  .action(updateCommand);

await program.parseAsync();
