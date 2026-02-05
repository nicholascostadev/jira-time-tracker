import { ensureAuthenticated } from '../services/auth.js';
import { getIssue } from '../services/jira.js';
import { getCurrentTimer, getElapsedSeconds, formatTime } from '../services/timer.js';
import { runInteractiveTimer } from '../ui/interactive.js';

export async function resumeCommand(): Promise<void> {
  // Check for active timer first (before authenticating)
  const timer = getCurrentTimer();
  if (!timer) {
    console.log();
    console.log('no active timer to resume');
    console.log('\x1b[90mrun "jtt start" to begin tracking\x1b[0m');
    console.log();
    process.exit(1);
  }

  // Ensure authenticated (handles config check and OAuth token refresh)
  await ensureAuthenticated();

  // Fetch issue from Jira
  console.log();
  const elapsed = formatTime(getElapsedSeconds(timer));
  console.log(`... resuming ${timer.issueKey} (${elapsed})`);

  let issue;
  try {
    issue = await getIssue(timer.issueKey);
    console.log(`+ ${issue.key} - ${issue.summary}`);
  } catch (error) {
    console.error('x failed to fetch issue');
    if (error instanceof Error) {
      console.error(`\x1b[90m  ${error.message}\x1b[0m`);
    }
    console.log();
    process.exit(1);
  }

  // Run interactive timer UI
  await runInteractiveTimer({ issue, timer });
}
