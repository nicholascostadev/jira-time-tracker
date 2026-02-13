import type { CliRenderer } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JiraIssue } from '../types/index.js';
import { getIssue, isJiraAuthenticationError } from '../services/jira.js';
import { getStatusColors, isDoneStatus, colors } from './theme.js';
import { showReauthenticationScreen } from './screens.js';
import { destroyUI, renderUI } from './react.js';

const ENTER_CUSTOM_KEY = '__custom__';

function buildAllStatuses(issues: JiraIssue[]): string[] {
  const statuses: string[] = [];
  for (const issue of issues) {
    const status = issue.status.toLowerCase();
    if (!statuses.includes(status)) {
      statuses.push(status);
    }
  }
  return statuses;
}

function IssueSelectionScreen({
  renderer,
  assignedIssues,
  onResolve,
  onCancel,
}: {
  renderer: CliRenderer;
  assignedIssues: JiraIssue[];
  onResolve: (issue: JiraIssue) => void;
  onCancel: () => void;
}) {
  const [currentStep, setCurrentStep] = useState<'select' | 'manual-input'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [statusFilterIndex, setStatusFilterIndex] = useState(-1);
  const [manualIssueKey, setManualIssueKey] = useState('');
  const selectRef = useRef<any>(null);
  const manualInputRef = useRef<any>(null);

  const activeIssues = useMemo(() => assignedIssues.filter((issue) => !isDoneStatus(issue.status)), [assignedIssues]);
  const allStatuses = useMemo(() => buildAllStatuses(activeIssues), [activeIssues]);

  const searchFilteredIssues = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) {
      return activeIssues;
    }

    return activeIssues.filter((issue) => (
      issue.key.toLowerCase().includes(query)
      || issue.summary.toLowerCase().includes(query)
      || issue.status.toLowerCase().includes(query)
    ));
  }, [activeIssues, searchQuery]);

  const options = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const activeStatus = statusFilterIndex >= 0 ? allStatuses[statusFilterIndex] : null;

    const filtered = activeIssues
      .filter((issue) => {
        if (activeStatus && issue.status.toLowerCase() !== activeStatus) {
          return false;
        }

        if (!query) {
          return true;
        }

        return (
          issue.key.toLowerCase().includes(query)
          || issue.summary.toLowerCase().includes(query)
          || issue.status.toLowerCase().includes(query)
        );
      })
      .map((issue) => ({
        name: `${issue.key} - ${issue.summary}`,
        description: issue.status.toLowerCase(),
        value: issue.key,
      }));

    filtered.push({
      name: '[ enter issue key ]',
      description: 'type a custom key',
      value: ENTER_CUSTOM_KEY,
    });

    return filtered;
  }, [activeIssues, allStatuses, searchQuery, statusFilterIndex]);

  const hasResults = options.length > 1;
  const listHeight = Math.min(options.length * 2 + 2, 18);

  useEffect(() => {
    if (currentStep !== 'manual-input') {
      return;
    }

    const timeoutId = setTimeout(() => {
      manualInputRef.current?.focus();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [currentStep]);

  const handleSelectIssue = useCallback((issueKey: string) => {
    if (issueKey === ENTER_CUSTOM_KEY) {
      setCurrentStep('manual-input');
      setSearchQuery('');
      return;
    }

    const issue = activeIssues.find((candidate) => candidate.key === issueKey);
    if (issue) {
      onResolve(issue);
    }
  }, [activeIssues, onResolve]);

  const handleManualSubmit = useCallback(async () => {
    const keyUpper = manualIssueKey.trim().toUpperCase();
    if (!/^[A-Z]+-\d+$/.test(keyUpper)) {
      setStatusMessage('Invalid format. Expected: PROJECT-123');
      setIsError(true);
      return;
    }

    setStatusMessage(`Fetching ${keyUpper}...`);
    setIsError(false);

    try {
      const issue = await getIssue(keyUpper);
      onResolve(issue);
    } catch (error) {
      if (isJiraAuthenticationError(error)) {
        const reauthenticated = await showReauthenticationScreen(renderer);
        if (reauthenticated) {
          setStatusMessage('Authentication updated. Press [enter] to retry.');
          setIsError(false);
          return;
        }

        setStatusMessage('Authentication update cancelled.');
        setIsError(true);
        return;
      }

      setStatusMessage(`Failed to fetch issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsError(true);
    }
  }, [manualIssueKey, onResolve, renderer]);

  const handleKey = useCallback((key: any) => {
    if (key.name === 'escape') {
      if (currentStep === 'manual-input') {
        setCurrentStep('select');
        setStatusMessage('');
        return;
      }

      if (searchQuery || statusFilterIndex >= 0) {
        setSearchQuery('');
        setStatusFilterIndex(-1);
        return;
      }

      onCancel();
      return;
    }

    if (key.name === 'return' || key.name === 'enter') {
      if (currentStep === 'select') {
        const option = selectRef.current?.getSelectedOption();
        if (option?.value) {
          handleSelectIssue(String(option.value));
        }
      } else {
        void handleManualSubmit();
      }
      return;
    }

    if (currentStep !== 'select') {
      return;
    }

    if (key.name === 'tab' || key.name === 'right' || key.name === 'left') {
      if (allStatuses.length > 0) {
        setStatusFilterIndex((previous) => {
          if (key.name === 'left' || (key.name === 'tab' && key.shift)) {
            const next = previous - 1;
            return next < -1 ? allStatuses.length - 1 : next;
          }

          const next = previous + 1;
          return next >= allStatuses.length ? -1 : next;
        });
      }
      return;
    }

    if (key.name === 'up') {
      selectRef.current?.moveUp();
      return;
    }

    if (key.name === 'down') {
      selectRef.current?.moveDown();
      return;
    }

    if (key.name === 'backspace') {
      setSearchQuery((current) => current.slice(0, -1));
      return;
    }

    if (key.name === 'x') {
      if (searchQuery || statusFilterIndex >= 0) {
        setSearchQuery('');
        setStatusFilterIndex(-1);
      }
      return;
    }

    if (
      key.sequence
      && key.sequence.length === 1
      && !key.ctrl
      && !key.meta
      && key.sequence.charCodeAt(0) >= 32
    ) {
      setSearchQuery((current) => current + key.sequence);
    }
  }, [allStatuses.length, currentStep, handleManualSubmit, handleSelectIssue, onCancel, searchQuery, statusFilterIndex]);

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
        <text content="SELECT ISSUE" fg={colors.text} />
      </box>

      {currentStep === 'select' && allStatuses.length > 0 && (
        <box flexDirection="row" gap={1} marginBottom={1} flexWrap="wrap">
          <box
            backgroundColor={statusFilterIndex === -1 ? colors.text : colors.bgSelected}
            paddingLeft={1}
            paddingRight={1}
          >
            <text
              content={`ALL ${searchFilteredIssues.length}`}
              fg={statusFilterIndex === -1 ? colors.bg : colors.textMuted}
            />
          </box>

          {allStatuses.map((status, index) => {
            const count = searchFilteredIssues.filter((issue) => issue.status.toLowerCase() === status).length;
            const active = statusFilterIndex === index;
            const statusColors = getStatusColors(status);

            return (
              <box
                key={status}
                backgroundColor={active ? statusColors.fg : statusColors.bg}
                paddingLeft={1}
                paddingRight={1}
              >
                <text content={`${status.toUpperCase()} ${count}`} fg={active ? colors.bg : statusColors.fg} />
              </box>
            );
          })}
        </box>
      )}

      {currentStep === 'select' && (
        <>
          <box
            borderStyle="rounded"
            borderColor={colors.borderFocused}
            border
            height={3}
            width="100%"
            marginBottom={1}
          >
            <text content={searchQuery ? `${searchQuery}█` : '█ type to search...'} fg={searchQuery ? colors.text : colors.textDim} />
          </box>

          {!hasResults && (searchQuery || statusFilterIndex >= 0) && (
            <box marginBottom={1}>
              <text
                content={searchQuery
                  ? `no issues matching "${searchQuery}"`
                  : `no issues with status "${allStatuses[statusFilterIndex]}"`}
                fg={colors.textMuted}
              />
            </box>
          )}

          {activeIssues.length === 0 && !searchQuery && (
            <box marginBottom={1}>
              <text content="no assigned issues found" fg={colors.textMuted} />
            </box>
          )}

          <box flexDirection="column" borderStyle="rounded" borderColor={colors.border} border padding={1} height={listHeight + 2}>
            <select
              ref={selectRef}
              width="100%"
              height={listHeight}
              options={options}
              backgroundColor={colors.bg}
              textColor={colors.text}
              focusedBackgroundColor={colors.bg}
              focusedTextColor={colors.text}
              selectedBackgroundColor={colors.text}
              selectedTextColor={colors.bg}
              descriptionColor={colors.textDim}
              selectedDescriptionColor={colors.bgHighlight}
              showScrollIndicator
              focused
            />
          </box>
        </>
      )}

      {currentStep === 'manual-input' && (
        <box flexDirection="column" gap={1}>
          <text content="enter issue key (e.g., PROJECT-123)" fg={colors.text} />
          <box borderStyle="rounded" borderColor={colors.borderFocused} border height={3} width="100%">
            <input
              ref={manualInputRef}
              width="100%"
              value={manualIssueKey}
              placeholder="PROJECT-123"
              onInput={setManualIssueKey}
              focused
            />
          </box>
        </box>
      )}

      {statusMessage && (
        <box marginTop={1}>
          <text content={statusMessage} fg={isError ? colors.error : colors.success} />
        </box>
      )}

      <box flexDirection="row" gap={3} marginTop={2}>
        {currentStep === 'select' && <text content="[enter] select" fg={colors.textDim} />}
        {currentStep === 'select' && <text content="[←→/tab] filter status" fg={colors.textDim} />}
        {currentStep === 'select' && <text content="[x] clear filters" fg={colors.textDim} />}
        {currentStep === 'select' && <text content="[↑↓] navigate" fg={colors.textDim} />}
        {currentStep === 'select' && <text content="[esc] cancel" fg={colors.textDim} />}

        {currentStep === 'manual-input' && <text content="[enter] select" fg={colors.textDim} />}
        {currentStep === 'manual-input' && <text content="[esc] back" fg={colors.textDim} />}
      </box>
    </box>
  );
}

export async function selectIssueInteractive(renderer: CliRenderer, assignedIssues: JiraIssue[]): Promise<JiraIssue> {
  return new Promise((resolve) => {
    const cancel = () => {
      destroyUI(renderer);
      console.log('\nCancelled.\n');
      process.exit(1);
    };

    renderUI(
      renderer,
      <IssueSelectionScreen
        renderer={renderer}
        assignedIssues={assignedIssues}
        onResolve={resolve}
        onCancel={cancel}
      />
    );
  });
}
