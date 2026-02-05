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
import { getIssue, getMyAssignedIssues, getCurrentUser } from '../services/jira.js';
import {
  createTimer,
  hasActiveTimer,
  getCurrentTimer,
  getElapsedSeconds,
  formatTime,
} from '../services/timer.js';
import { runInteractiveTimer } from '../ui/interactive.js';
import type { JiraIssue } from '../types/index.js';
import { colors } from '../ui/theme.js';

interface StartOptions {
  description?: string;
}

const ENTER_CUSTOM_KEY = '__custom__';

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
  await ensureAuthenticated();

  let selectedIssue: JiraIssue;

  // If issue key provided directly, validate and use it
  if (issueKey) {
    const issueKeyUpper = issueKey.toUpperCase();
    if (!/^[A-Z]+-\d+$/.test(issueKeyUpper)) {
      console.log(`x invalid issue key: ${issueKey}`);
      console.log('\x1b[90m  expected: PROJECT-123\x1b[0m');
      console.log();
      process.exit(1);
    }

    console.log(`\n... fetching ${issueKeyUpper}`);
    try {
      selectedIssue = await getIssue(issueKeyUpper);
      console.log(`+ ${selectedIssue.key} - ${selectedIssue.summary}`);
    } catch (error) {
      console.error('x failed to fetch issue');
      if (error instanceof Error) {
        console.error(`\x1b[90m  ${error.message}\x1b[0m`);
      }
      console.log();
      process.exit(1);
    }

    // Get description and start timer
    const description = options.description || await getDescriptionInteractive();
    const timer = createTimer(selectedIssue.key, description);
    await runInteractiveTimer({ issue: selectedIssue, timer });
    return;
  }

  // No issue key - show interactive selection
  console.log('\n... fetching assigned issues');

  let assignedIssues: JiraIssue[];
  let userName: string;

  try {
    const [issues, user] = await Promise.all([getMyAssignedIssues(), getCurrentUser()]);
    assignedIssues = issues;
    userName = user.displayName;
    console.log(`+ ${userName}`);
  } catch (error) {
    console.error('x failed to fetch issues');
    if (error instanceof Error) {
      console.error(`\x1b[90m  ${error.message}\x1b[0m`);
    }
    console.log();
    process.exit(1);
  }

  // Start interactive UI for issue selection
  selectedIssue = await selectIssueInteractive(assignedIssues);
  
  // Get description
  const description = options.description || await getDescriptionInteractive();
  
  // Create and start timer
  const timer = createTimer(selectedIssue.key, description);
  await runInteractiveTimer({ issue: selectedIssue, timer });
}

async function selectIssueInteractive(assignedIssues: JiraIssue[]): Promise<JiraIssue> {
  return new Promise(async (resolve, reject) => {
    let renderer: CliRenderer;
    let currentStep: 'select' | 'manual-input' = 'select';
    let manualKey = '';
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

    const cleanup = (issue?: JiraIssue) => {
      renderer.destroy();
      if (issue) {
        resolve(issue);
      } else {
        console.log('\nCancelled.\n');
        process.exit(1);
      }
    };

    const buildUI = () => {
      const children: ReturnType<typeof Box>[] = [];

      // Header - minimal
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
            content: t`${bold(fg(colors.text)('select issue'))}`,
          })
        )
      );

      if (currentStep === 'select') {
        // Build options list
        const options = assignedIssues.map((issue) => ({
          name: `${issue.key} - ${issue.summary}`,
          description: issue.status.toLowerCase(),
          value: issue.key,
        }));

        // Add manual entry option
        options.push({
          name: '[ enter issue key ]',
          description: 'type a custom key',
          value: ENTER_CUSTOM_KEY,
        });

        if (assignedIssues.length === 0) {
          children.push(
            Box(
              {
                marginBottom: 1,
              },
              Text({
                content: 'no assigned issues found',
                fg: colors.textMuted,
              })
            )
          );
        }

        children.push(
          Box(
            {
              flexDirection: 'column',
              borderStyle: 'rounded',
              borderColor: colors.border,
              border: true,
              padding: 1,
              height: Math.min(options.length * 2 + 4, 20),
            },
            Select({
              id: 'issue-select',
              width: 70,
              height: Math.min(options.length * 2 + 2, 18),
              options,
              selectedBackgroundColor: colors.text,
              selectedTextColor: '#000000',
              descriptionColor: colors.textDim,
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
                width: 40,
              },
              Input({
                id: 'issue-key-input',
                width: 38,
                value: manualKey,
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
            {
              marginTop: 1,
            },
            Text({
              content: statusMessage,
              fg: isError ? colors.error : colors.success,
            })
          )
        );
      }

      // Footer hints - minimal
      children.push(
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 2,
          },
          Text({
            content: '[enter] select',
            fg: colors.textDim,
          }),
          Text({
            content: '[esc] cancel',
            fg: colors.textDim,
          })
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
      while (renderer.root.getChildrenCount() > 0) {
        const children = renderer.root.getChildren();
        if (children.length > 0) {
          renderer.root.remove(children[0].id);
        }
      }

      const ui = buildUI();
      renderer.root.add(ui);

      setTimeout(() => {
        const elementId = currentStep === 'select' ? 'issue-select' : 'issue-key-input';
        const element = renderer.root.findDescendantById(elementId);
        if (element) {
          element.focus();
        }
      }, 50);
    };

    const handleSelectIssue = async (issueKey: string) => {
      if (issueKey === ENTER_CUSTOM_KEY) {
        currentStep = 'manual-input';
        render();
        return;
      }

      // Find the issue in the list
      const issue = assignedIssues.find((i) => i.key === issueKey);
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
      }
    });

    render();
    renderer.start();
  });
}

async function getDescriptionInteractive(): Promise<string> {
  return new Promise(async (resolve) => {
    let renderer: CliRenderer;
    let description = '';
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

    const cleanup = (desc: string) => {
      renderer.destroy();
      resolve(desc);
    };

    const buildUI = () => {
      return Box(
        {
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          padding: 1,
          backgroundColor: colors.bg,
        },
        // Header - minimal
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
            content: t`${bold(fg(colors.text)('work description'))}`,
          })
        ),
        // Input
        Box(
          {
            flexDirection: 'column',
            gap: 1,
          },
          Text({
            content: 'what are you working on?',
            fg: colors.text,
          }),
          Box(
            {
              borderStyle: 'rounded',
              borderColor: colors.borderFocused,
              border: true,
              height: 3,
              width: 60,
            },
            Input({
              id: 'description-input',
              width: 58,
              value: description,
              placeholder: 'Describe your work...',
            })
          )
        ),
        // Status message
        statusMessage
          ? Box(
              {
                marginTop: 1,
              },
              Text({
                content: statusMessage,
                fg: isError ? colors.error : colors.success,
              })
            )
          : Box({}),
        // Footer - minimal
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 2,
          },
          Text({
            content: '[enter] start',
            fg: colors.textDim,
          }),
          Text({
            content: '[esc] cancel',
            fg: colors.textDim,
          })
        )
      );
    };

    const render = () => {
      while (renderer.root.getChildrenCount() > 0) {
        const children = renderer.root.getChildren();
        if (children.length > 0) {
          renderer.root.remove(children[0].id);
        }
      }

      const ui = buildUI();
      renderer.root.add(ui);

      setTimeout(() => {
        const input = renderer.root.findDescendantById('description-input');
        if (input) {
          input.focus();
        }
      }, 50);
    };

    renderer.keyInput.on('keypress', (key: KeyEvent) => {
      if (key.name === 'escape') {
        renderer.destroy();
        console.log('\nCancelled.\n');
        process.exit(1);
      }

      if (key.name === 'return' || key.name === 'enter') {
        const input = renderer.root.findDescendantById('description-input') as InputRenderable | undefined;
        if (input) {
          const value = input.value.trim();
          if (!value) {
            statusMessage = 'Description is required';
            isError = true;
            render();
            return;
          }
          cleanup(value);
        }
      }
    });

    render();
    renderer.start();
  });
}
