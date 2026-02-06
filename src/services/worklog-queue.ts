import { getFailedWorklogs, removeFailedWorklog } from './config.js';
import { addWorklog } from './jira.js';

export interface RetryResult {
  total: number;
  succeeded: number;
  failed: number;
}

/**
 * Retries all failed worklogs in the queue.
 * Successfully posted worklogs are removed from the queue.
 * Returns a summary of what happened.
 */
export async function retryFailedWorklogs(): Promise<RetryResult> {
  const queue = getFailedWorklogs();
  if (queue.length === 0) {
    return { total: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  // Process in reverse order so removal indices stay valid
  for (let i = queue.length - 1; i >= 0; i--) {
    const worklog = queue[i];
    try {
      await addWorklog(
        worklog.issueKey,
        worklog.timeSpentSeconds,
        worklog.comment,
        new Date(worklog.started)
      );
      removeFailedWorklog(i);
      succeeded++;
    } catch {
      failed++;
    }
  }

  return { total: queue.length, succeeded, failed };
}
