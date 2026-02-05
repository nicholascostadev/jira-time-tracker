import { getCurrentTimer, getElapsedSeconds, formatTime } from '../services/timer.js';
import { isConfigured } from '../services/config.js';

export function statusCommand(): void {
  console.log();
  console.log('\x1b[1mjira time tracker\x1b[0m');
  console.log('\x1b[90m─────────────────\x1b[0m');
  console.log();

  // Check configuration
  if (!isConfigured()) {
    console.log('\x1b[90mconfig\x1b[0m  not configured');
    console.log('\x1b[90m        run "jtt config" to set up\x1b[0m');
    console.log();
    return;
  }

  console.log('\x1b[90mconfig\x1b[0m  ready');
  console.log();

  // Check for active timer
  const timer = getCurrentTimer();
  if (!timer) {
    console.log('\x1b[90mno active timer\x1b[0m');
    console.log('\x1b[90mrun "jtt start" to begin tracking\x1b[0m');
    console.log();
    return;
  }

  const elapsed = getElapsedSeconds(timer);
  const timeDisplay = formatTime(elapsed);
  const status = timer.isPaused ? '\x1b[33mpaused\x1b[0m' : '\x1b[32mrunning\x1b[0m';

  console.log('\x1b[90missue\x1b[0m   ' + timer.issueKey);
  console.log('\x1b[90mwork\x1b[0m    ' + timer.description);
  console.log('\x1b[90mstatus\x1b[0m  ' + status);
  console.log('\x1b[90mtime\x1b[0m    \x1b[1m' + timeDisplay + '\x1b[0m');
  console.log('\x1b[90mstarted\x1b[0m ' + new Date(timer.startedAt).toLocaleString());
  console.log();
  console.log('\x1b[90mrun "jtt resume" to continue\x1b[0m');
  console.log();
}
