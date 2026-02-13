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
  type SelectRenderable,
  type InputRenderable,
} from '@opentui/core';
import { ensureAuthenticated } from '../services/auth.js';
import { getIssue, getMyAssignedIssues, getCurrentUser, isJiraAuthenticationError } from '../services/jira.js';
import {
  createTimer,
  hasActiveTimer,
  getCurrentTimer,
  getElapsedSeconds,
  formatTime,
} from '../services/timer.js';
import { runInteractiveTimer } from '../ui/interactive.js';
import type { JiraIssue } from '../types/index.js';
import { colors, getStatusColors, isDoneStatus } from '../ui/theme.js';
import { retryFailedWorklogs } from '../services/worklog-queue.js';
import { getFailedWorklogs } from '../services/config.js';
import { clearRenderer, showErrorScreen, showLoadingScreen, showReauthenticationScreen } from '../ui/screens.js';

interface StartOptions {
  description?: string;
}

const ENTER_CUSTOM_KEY = '__custom__';

/**
 * Creates a shared renderer that will be reused across all interactive screens
 * to avoid flickering when transitioning between pages.
 */
async function createSharedRenderer(): Promise<CliRenderer> {
  return await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
    backgroundColor: colors.bg,
  });
}

export async function startCommand(
  issueKey: string | undefined,
  options: StartOptions
): Promise<void> {
  // Check for active timer first (simple console output)
  if (hasActiveTimer()) {
    const activeTimer = getCurrentTimer();
    if (activeTimer) {
      const elapsed = formatTime(getElapsedSeconds(activeTimer));
      console.log();
      console.log(`! timer already running for ${activeTimer.issueKey}`);
      console.log(`\x1b[90m  elapsed: ${elapsed}\x1b[0m`);
      console.log(`\x1b[90m  ${activeTimer.description}\x1b[0m`);
      console.log();
      console.log(`run "jtt resume" to continue`);
      console.log();
      process.exit(1);
    }
  }

  // Ensure authenticated
  try {
    await ensureAuthenticated();
  } catch (error) {
    console.log();
    console.log(`x ${error instanceof Error ? error.message : 'Authentication failed'}`);
    console.log();
    process.exit(1);
  }

  // Retry any failed worklogs from the offline queue
  const pendingWorklogs = getFailedWorklogs();
  if (pendingWorklogs.length > 0) {
    const result = await retryFailedWorklogs();
    if (result.succeeded > 0) {
      console.log(`+ retried ${result.succeeded} pending worklog(s)`);
    }
    if (result.failed > 0) {
      console.log(`\x1b[90m  ${result.failed} worklog(s) still pending\x1b[0m`);
    }
  }

  let selectedIssue: JiraIssue;

  // Create shared renderer for the entire interactive flow
  const renderer = await createSharedRenderer();

  // If issue key provided directly, validate and use it
  if (issueKey) {
    const issueKeyUpper = issueKey.toUpperCase();
    if (!/^[A-Z]+-\d+$/.test(issueKeyUpper)) {
      await showErrorScreen(renderer, `Invalid issue key: ${issueKey}. Expected format: PROJECT-123`);
      renderer.destroy();
      process.exit(1);
    }

    // Show loading while fetching issue
    selectedIssue = await showLoadingScreen(
      renderer,
      `fetching ${issueKeyUpper}`,
      () => getIssue(issueKeyUpper)
    );

    // Start timer immediately - description is entered when stopping
    const timer = createTimer(selectedIssue.key, '');
    const result = await runInteractiveTimer({ issue: selectedIssue, timer, renderer, defaultDescription: options.description });

    if (result.action === 'quit') {
      renderer.destroy();
      console.log('\nTimer cancelled. Time was not logged.\n');
      process.exit(0);
    }

    if (result.action === 'error') {
      // Worklog failed but was queued — continue to issue selection
    }

    // If logged or error, fall through to the interactive loop below
  }

  // Main interactive loop: select issue → describe → track → log → repeat
  while (true) {
    // Fetch assigned issues
    const fetchResult = await showLoadingScreen(
      renderer,
      'fetching assigned issues',
      () => Promise.all([getMyAssignedIssues(), getCurrentUser()])
    );
    const assignedIssues = fetchResult[0];

    // Select issue
    selectedIssue = await selectIssueInteractive(renderer, assignedIssues);

    // Create and start timer immediately - description is entered when stopping
    const timer = createTimer(selectedIssue.key, '');
    const result = await runInteractiveTimer({ issue: selectedIssue, timer, renderer, defaultDescription: options.description });

    if (result.action === 'quit') {
      renderer.destroy();
      console.log('\nTimer cancelled. Time was not logged.\n');
      process.exit(0);
    }

    // If 'logged' or 'error', loop continues → re-fetch issues → select next task
  }
}

async function selectIssueInteractive(renderer: CliRenderer, assignedIssues: JiraIssue[]): Promise<JiraIssue> {
  return new Promise(async (resolve) => {
    let currentStep: 'select' | 'manual-input' = 'select';
    let searchQuery = '';
    let statusMessage = '';
    let isError = false;

    // Filter out done issues
    const activeIssues = assignedIssues.filter((i) => !isDoneStatus(i.status));

    // Build unique status list from actual issues (for Tab filter)
    const allStatuses: string[] = [];
    for (const issue of activeIssues) {
      const s = issue.status.toLowerCase();
      if (!allStatuses.includes(s)) {
        allStatuses.push(s);
      }
    }
    // 'all' is index -1 (no filter)
    let statusFilterIndex = -1;

    // Remove old keypress listeners from previous pages
    renderer.keyInput.removeAllListeners('keypress');

    const cleanup = (issue?: JiraIssue) => {
      if (issue) {
        resolve(issue);
      } else {
        renderer.destroy();
        console.log('\nCancelled.\n');
        process.exit(1);
      }
    };

    const getFilteredOptions = () => {
      const query = searchQuery.toLowerCase();
      const activeStatus = statusFilterIndex >= 0 ? allStatuses[statusFilterIndex] : null;

      const filtered = activeIssues
        .filter((issue) => {
          // Status filter
          if (activeStatus && issue.status.toLowerCase() !== activeStatus) {
            return false;
          }
          // Text search
          if (query) {
            return (
              issue.key.toLowerCase().includes(query) ||
              issue.summary.toLowerCase().includes(query) ||
              issue.status.toLowerCase().includes(query)
            );
          }
          return true;
        })
        .map((issue) => ({
          name: `${issue.key} - ${issue.summary}`,
          description: issue.status.toLowerCase(),
          value: issue.key,
        }));

      // Always add manual entry option at the end
      filtered.push({
        name: '[ enter issue key ]',
        description: 'type a custom key',
        value: ENTER_CUSTOM_KEY,
      });

      return filtered;
    };

    const getSearchFilteredIssues = () => {
      const query = searchQuery.toLowerCase();
      if (!query) return activeIssues;
      return activeIssues.filter(
        (issue) =>
          issue.key.toLowerCase().includes(query) ||
          issue.summary.toLowerCase().includes(query) ||
          issue.status.toLowerCase().includes(query)
      );
    };

    const buildStatusPills = () => {
      const pills: ReturnType<typeof Box>[] = [];
      const searchFiltered = getSearchFilteredIssues();

      // "All" pill — count reflects search-matched issues
      const allActive = statusFilterIndex === -1;
      pills.push(
        Box(
          {
            backgroundColor: allActive ? colors.text : colors.bgSelected,
            paddingLeft: 1,
            paddingRight: 1,
          },
          Text({
            content: `ALL ${searchFiltered.length}`,
            fg: allActive ? colors.bg : colors.textMuted,
          })
        )
      );

      // Status pills — each count reflects search-matched issues within that status
      for (let i = 0; i < allStatuses.length; i++) {
        const status = allStatuses[i];
        const count = searchFiltered.filter((iss) => iss.status.toLowerCase() === status).length;
        const active = statusFilterIndex === i;
        const statusColors = getStatusColors(status);

        pills.push(
          Box(
            {
              backgroundColor: active ? statusColors.fg : statusColors.bg,
              paddingLeft: 1,
              paddingRight: 1,
            },
            Text({
              content: `${status.toUpperCase()} ${count}`,
              fg: active ? colors.bg : statusColors.fg,
            })
          )
        );
      }

      return Box(
        {
          flexDirection: 'row',
          gap: 1,
          marginBottom: 1,
          flexWrap: 'wrap',
        },
        ...pills
      );
    };

    const buildUI = () => {
      const children: ReturnType<typeof Box>[] = [];

      // Header
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
            content: t`${bold(fg(colors.text)('SELECT ISSUE'))}`,
          })
        )
      );

      if (currentStep === 'select') {
        // Status filter pills
        if (allStatuses.length > 0) {
          children.push(buildStatusPills());
        }

        // Search input
        children.push(
          Box(
            {
              borderStyle: 'rounded',
              borderColor: colors.borderFocused,
              border: true,
              height: 3,
              width: '100%',
              marginBottom: 1,
            },
            Text({
              content: searchQuery
                ? searchQuery + '█'
                : '█ type to search...',
              fg: searchQuery ? colors.text : colors.textDim,
            })
          )
        );

        const options = getFilteredOptions();

        // "No results" messages
        const hasResults = options.length > 1;
        if (!hasResults && (searchQuery || statusFilterIndex >= 0)) {
          children.push(
            Box(
              { marginBottom: 1 },
              Text({
                content: searchQuery
                  ? `no issues matching "${searchQuery}"`
                  : `no issues with status "${allStatuses[statusFilterIndex]}"`,
                fg: colors.textMuted,
              })
            )
          );
        }

        if (activeIssues.length === 0 && !searchQuery) {
          children.push(
            Box(
              { marginBottom: 1 },
              Text({
                content: 'no assigned issues found',
                fg: colors.textMuted,
              })
            )
          );
        }

        const listHeight = Math.min(options.length * 2 + 2, 18);
        children.push(
          Box(
            {
              flexDirection: 'column',
              borderStyle: 'rounded',
              borderColor: colors.border,
              border: true,
              padding: 1,
              height: listHeight + 2,
            },
            Select({
              id: 'issue-select',
              width: '100%',
              height: listHeight,
              options,
              backgroundColor: colors.bg,
              textColor: colors.text,
              focusedBackgroundColor: colors.bg,
              focusedTextColor: colors.text,
              selectedBackgroundColor: colors.text,
              selectedTextColor: colors.bg,
              descriptionColor: colors.textDim,
              selectedDescriptionColor: colors.bgHighlight,
              showScrollIndicator: true,
            })
          )
        );
      } else {
        // Manual input
        children.push(
          Box(
            {
              flexDirection: 'column',
              gap: 1,
            },
            Text({
              content: 'enter issue key (e.g., PROJECT-123)',
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
                id: 'issue-key-input',
                width: '100%',
                value: '',
                placeholder: 'PROJECT-123',
              })
            )
          )
        );
      }

      // Status message
      if (statusMessage) {
        children.push(
          Box(
            { marginTop: 1 },
            Text({
              content: statusMessage,
              fg: isError ? colors.error : colors.success,
            })
          )
        );
      }

      // Footer hints
      const hints = currentStep === 'select'
        ? [
            { text: '[enter] select' },
            { text: '[←→/tab] filter status' },
            { text: '[x] clear filters' },
            { text: '[↑↓] navigate' },
            { text: '[esc] cancel' },
          ]
        : [
            { text: '[enter] select' },
            { text: '[esc] back' },
          ];

      children.push(
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 2,
          },
          ...hints.map((h) =>
            Text({
              content: h.text,
              fg: colors.textDim,
            })
          )
        )
      );

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
      clearRenderer(renderer);

      const ui = buildUI();
      renderer.root.add(ui);

      if (currentStep === 'manual-input') {
        setTimeout(() => {
          const element = renderer.root.findDescendantById('issue-key-input');
          if (element) {
            element.focus();
          }
        }, 50);
      }
    };

    const handleSelectIssue = async (issueKey: string) => {
      if (issueKey === ENTER_CUSTOM_KEY) {
        currentStep = 'manual-input';
        searchQuery = '';
        render();
        return;
      }

      const issue = activeIssues.find((i) => i.key === issueKey);
      if (issue) {
        cleanup(issue);
      }
    };

    const handleManualKey = async (key: string) => {
      const keyUpper = key.trim().toUpperCase();
      if (!/^[A-Z]+-\d+$/.test(keyUpper)) {
        statusMessage = 'Invalid format. Expected: PROJECT-123';
        isError = true;
        render();
        return;
      }

      statusMessage = `Fetching ${keyUpper}...`;
      isError = false;
      render();

      try {
        const issue = await getIssue(keyUpper);
        cleanup(issue);
      } catch (error) {
        if (isJiraAuthenticationError(error)) {
          const reauthenticated = await showReauthenticationScreen(renderer);
          if (reauthenticated) {
            statusMessage = 'Authentication updated. Press [enter] to retry.';
            isError = false;
            render();
            return;
          }

          statusMessage = 'Authentication update cancelled.';
          isError = true;
          render();
          return;
        }

        statusMessage = `Failed to fetch issue: ${error instanceof Error ? error.message : 'Unknown error'}`;
        isError = true;
        render();
      }
    };

    renderer.keyInput.on('keypress', (key: KeyEvent) => {
      if (key.name === 'escape') {
        if (currentStep === 'manual-input') {
          currentStep = 'select';
          statusMessage = '';
          render();
        } else if (searchQuery || statusFilterIndex >= 0) {
          // Clear filters first
          searchQuery = '';
          statusFilterIndex = -1;
          render();
        } else {
          cleanup();
        }
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        if (currentStep === 'select') {
          const select = renderer.root.findDescendantById('issue-select') as SelectRenderable;
          if (select) {
            const option = select.getSelectedOption();
            if (option?.value) {
              handleSelectIssue(option.value);
            }
          }
        } else {
          const input = renderer.root.findDescendantById('issue-key-input') as InputRenderable | undefined;
          if (input) {
            handleManualKey(input.value);
          }
        }
        return;
      }

      // Select step: handle search, navigation, and status filter
      if (currentStep === 'select') {
        // Tab / Right cycles forward, Shift+Tab / Left cycles backward through status filters
        if (key.name === 'tab' || key.name === 'right' || key.name === 'left') {
          if (allStatuses.length > 0) {
            if (key.name === 'left' || (key.name === 'tab' && key.shift)) {
              statusFilterIndex--;
              if (statusFilterIndex < -1) {
                statusFilterIndex = allStatuses.length - 1;
              }
            } else {
              statusFilterIndex++;
              if (statusFilterIndex >= allStatuses.length) {
                statusFilterIndex = -1; // back to "all"
              }
            }
            render();
          }
          return;
        }

        if (key.name === 'up') {
          const select = renderer.root.findDescendantById('issue-select') as SelectRenderable;
          if (select) select.moveUp();
          return;
        }

        if (key.name === 'down') {
          const select = renderer.root.findDescendantById('issue-select') as SelectRenderable;
          if (select) select.moveDown();
          return;
        }

        if (key.name === 'backspace') {
          if (searchQuery.length > 0) {
            searchQuery = searchQuery.slice(0, -1);
            render();
          }
          return;
        }

        if (key.name === 'x') {
          if (searchQuery || statusFilterIndex >= 0) {
            searchQuery = '';
            statusFilterIndex = -1;
            render();
          }
          return;
        }

        // Printable character — append to search
        if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta &&
          key.sequence.charCodeAt(0) >= 32
        ) {
          searchQuery += key.sequence;
          render();
          return;
        }
      }
    });

    render();
  });
}

