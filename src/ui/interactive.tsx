import {
  createCliRenderer,
  measureText,
  type CliRenderer,
} from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JiraIssue, TimerState } from '../types/index.js';
import {
  formatTime,
  formatTimeHumanReadable,
  getElapsedSeconds,
  getWorklogSegments,
  pauseTimer,
  resumeTimer,
  stopTimer,
} from '../services/timer.js';
import {
  addWorklog,
  isJiraAuthenticationError,
} from '../services/jira.js';
import {
  addFailedWorklog,
  getActiveTimer,
  getDefaultWorklogMessage,
  setDefaultWorklogMessage,
} from '../services/config.js';
import {
  buildWorklogsToPost,
  canSplitWorklogEntries,
  countRoundedEntries,
  getDefaultWorklogMode,
  type WorklogMode,
} from './worklog-review.js';
import { colors } from './theme.js';
import { showReauthenticationScreen } from './screens.js';
import { destroyUI, renderUI } from './react.js';
import { Spinner } from './components.js';

interface InteractiveTimerOptions {
  issue: JiraIssue;
  timer: TimerState;
  renderer?: CliRenderer;
  defaultDescription?: string;
}

export type TimerResult =
  | { action: 'logged' }
  | { action: 'quit' }
  | { action: 'error'; message: string };

const QUIT_CONFIRM_THRESHOLD_SECONDS = 5 * 60;
const ASCII_FONT = 'block' as const;
const MAX_DIGIT_WIDTH = Math.max(
  ...('0123456789'.split('').map((digit) => measureText({ text: digit, font: ASCII_FONT }).width))
);
const COLON_WIDTH = measureText({ text: ':', font: ASCII_FONT }).width;
const FONT_HEIGHT = measureText({ text: '0', font: ASCII_FONT }).height;

type WorkflowResult =
  | { action: 'quit' }
  | { action: 'submit'; description: string; mode: WorklogMode };

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function TimerWorkflowScreen({
  issue,
  defaultDescription,
  onComplete,
}: {
  issue: JiraIssue;
  defaultDescription?: string;
  onComplete: (result: WorkflowResult) => void;
}) {
  const [screen, setScreen] = useState<'timer' | 'description' | 'review'>('timer');
  const [tick, setTick] = useState(0);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(defaultDescription ?? getDefaultWorklogMessage());
  const [reviewMode, setReviewMode] = useState<WorklogMode>('single');
  const descriptionInputRef = useRef<any>(null);

  useEffect(() => {
    if (screen !== 'timer') {
      return;
    }

    const intervalId = setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'description') {
      return;
    }

    const timeoutId = setTimeout(() => {
      descriptionInputRef.current?.focus();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [screen]);

  const currentTimer = getActiveTimer();
  const elapsed = currentTimer ? getElapsedSeconds(currentTimer) : 0;
  const timeDisplay = formatTime(elapsed);
  const statusText = currentTimer?.isPaused ? 'PAUSED' : 'RUNNING';
  const statusColor = currentTimer?.isPaused ? colors.timerPaused : colors.timerRunning;
  const borderColor = currentTimer?.isPaused ? colors.border : colors.borderActive;

  const reviewContext = useMemo(() => {
    if (!currentTimer) {
      return null;
    }

    const segments = getWorklogSegments(currentTimer);
    const totalElapsed = getElapsedSeconds(currentTimer);
    const hasSplitOptions = canSplitWorklogEntries(segments, totalElapsed);
    const previewSegments = hasSplitOptions
      ? segments
      : [{
          startedAt: currentTimer.startedAt,
          endedAt: Date.now(),
          durationSeconds: totalElapsed,
        }];

    return {
      segments,
      totalElapsed,
      hasSplitOptions,
      previewSegments,
    };
  }, [currentTimer, tick]);

  const handleKey = useCallback((key: any) => {
    if (!currentTimer) {
      onComplete({ action: 'quit' });
      return;
    }

    const keyName = key.name?.toLowerCase();
    if (!keyName) {
      return;
    }

    if (screen === 'timer') {
      switch (keyName) {
        case 'y':
          if (showQuitConfirm) {
            onComplete({ action: 'quit' });
          }
          return;

        case 'n':
          if (showQuitConfirm) {
            setShowQuitConfirm(false);
          }
          return;

        case 'p':
          if (!showQuitConfirm && !currentTimer.isPaused) {
            pauseTimer();
            setTick((current) => current + 1);
          }
          return;

        case 'r':
          if (!showQuitConfirm && currentTimer.isPaused) {
            resumeTimer();
            setTick((current) => current + 1);
          }
          return;

        case 's':
          if (showQuitConfirm) {
            return;
          }

          if (!currentTimer.isPaused) {
            pauseTimer();
          }

          setShowQuitConfirm(false);
          setScreen('description');
          return;

        case 'q':
        case 'escape':
          if (showQuitConfirm) {
            setShowQuitConfirm(false);
            return;
          }

          if (elapsed >= QUIT_CONFIRM_THRESHOLD_SECONDS) {
            setShowQuitConfirm(true);
          } else {
            onComplete({ action: 'quit' });
          }
          return;

        default:
          return;
      }
    }

    if (screen === 'description') {
      if (keyName === 'escape') {
        resumeTimer();
        setScreen('timer');
        setShowQuitConfirm(false);
        return;
      }

      if (keyName === 'tab') {
        setSaveAsDefault((current) => !current);
        return;
      }

      if (keyName === 'return' || keyName === 'enter') {
        const value = descriptionValue.trim();
        if (!value) {
          return;
        }

        if (saveAsDefault) {
          setDefaultWorklogMessage(value);
        }

        if (reviewContext) {
          setReviewMode(getDefaultWorklogMode(reviewContext.segments, reviewContext.totalElapsed));
        }
        setDescriptionValue(value);
        setScreen('review');
      }
      return;
    }

    if (screen === 'review') {
      if (keyName === 'escape') {
        setScreen('description');
        return;
      }

      if (keyName === 'tab' || keyName === 'left' || keyName === 'right') {
        if (!reviewContext?.hasSplitOptions) {
          return;
        }

        setReviewMode((current) => (current === 'single' ? 'split' : 'single'));
        return;
      }

      if (keyName === 'return' || keyName === 'enter') {
        onComplete({ action: 'submit', description: descriptionValue.trim(), mode: reviewMode });
      }
    }
  }, [
    currentTimer,
    descriptionValue,
    elapsed,
    onComplete,
    reviewContext,
    reviewMode,
    saveAsDefault,
    screen,
    showQuitConfirm,
  ]);

  useKeyboard(handleKey);

  if (!currentTimer) {
    return (
      <box width="100%" height="100%" alignItems="center" justifyContent="center" backgroundColor={colors.bg}>
        <text content="Timer not found" fg={colors.error} />
      </box>
    );
  }

  if (screen === 'description') {
    const defaultToggleText = saveAsDefault ? '* will save as default' : '  save as default';

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
          <text content="WORK DESCRIPTION" fg={colors.text} />
        </box>

        <box flexDirection="column" gap={1}>
          <text content={`What did you work on for ${issue.key}?`} fg={colors.text} />
          <box borderStyle="rounded" borderColor={colors.borderFocused} border height={3} width="100%">
            <input
              ref={descriptionInputRef}
              width="100%"
              value={descriptionValue}
              placeholder="Describe your work..."
              onInput={setDescriptionValue}
              focused
            />
          </box>
          <text content={defaultToggleText} fg={saveAsDefault ? colors.success : colors.textDim} />
        </box>

        <box flexDirection="row" gap={3} marginTop={2}>
          <text content="[enter] review" fg={colors.textDim} />
          <text content="[tab] save as default" fg={colors.textDim} />
          <text content="[esc] resume timer" fg={colors.textDim} />
        </box>
      </box>
    );
  }

  if (screen === 'review' && reviewContext) {
    const singleRounded = reviewContext.totalElapsed < 60;
    const singleSelected = reviewMode === 'single';
    const splitSelected = reviewMode === 'split';

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
          <text content="REVIEW WORKLOG" fg={colors.text} />
        </box>

        <box width="100%" flexDirection="column" paddingLeft={2} paddingRight={2} gap={0} marginBottom={1}>
          <box flexDirection="row" gap={1}>
            <text content={'ISSUE'.padEnd(14)} fg={colors.textDim} />
            <text content={issue.key} fg={colors.text} />
          </box>
          <box flexDirection="row" gap={1}>
            <text content={'DESCRIPTION'.padEnd(14)} fg={colors.textDim} />
            <text content={descriptionValue || '(none)'} fg={colors.textMuted} />
          </box>
          <box flexDirection="row" gap={1}>
            <text content={'TOTAL TIME'.padEnd(14)} fg={colors.textDim} />
            <text content={formatTimeHumanReadable(reviewContext.totalElapsed)} fg={colors.text} />
          </box>
        </box>

        <box width="100%" flexDirection="row" gap={2} flexGrow={1}>
          <box
            flexGrow={1}
            flexDirection="column"
            borderStyle="rounded"
            borderColor={singleSelected ? colors.borderActive : colors.border}
            border
            padding={1}
            backgroundColor={singleSelected ? colors.bgHighlight : colors.bg}
            title={singleSelected ? ' ● Single Entry ' : ' ○ Single Entry '}
            gap={1}
          >
            <text
              content="Log all time as one worklog entry"
              fg={singleSelected ? colors.textMuted : colors.textDim}
            />
            <box flexDirection="column" gap={0}>
              <text
                content={`${formatClock(reviewContext.previewSegments[0].startedAt)}  ->  ${formatClock(reviewContext.previewSegments[reviewContext.previewSegments.length - 1].endedAt)}`}
                fg={singleSelected ? colors.text : colors.textDim}
              />
              <text
                content={formatTimeHumanReadable(reviewContext.totalElapsed < 60 ? 60 : reviewContext.totalElapsed)}
                fg={singleSelected ? colors.textMuted : colors.textDim}
              />
            </box>
            {singleRounded && <text content="! rounded to 1m minimum" fg={colors.warning} />}
          </box>

          <box
            flexGrow={1}
            flexDirection="column"
            borderStyle="rounded"
            borderColor={splitSelected && reviewContext.hasSplitOptions ? colors.borderActive : colors.border}
            border
            padding={1}
            backgroundColor={splitSelected && reviewContext.hasSplitOptions ? colors.bgHighlight : colors.bg}
            title={
              reviewContext.hasSplitOptions
                ? (splitSelected ? ' ● Split Entries ' : ' ○ Split Entries ')
                : ' ○ Split Entries '
            }
            gap={1}
          >
            {reviewContext.hasSplitOptions && (
              <text
                content={`Log as ${reviewContext.previewSegments.length} separate worklog entries`}
                fg={splitSelected ? colors.textMuted : colors.textDim}
              />
            )}

            {reviewContext.hasSplitOptions && reviewContext.previewSegments.map((segment, index) => {
              const rounded = segment.durationSeconds < 60;
              return (
                <box key={`${segment.startedAt}-${segment.endedAt}-${index}`} flexDirection="column" gap={0}>
                  <text
                    content={`${index + 1}. ${formatClock(segment.startedAt)}  ->  ${formatClock(segment.endedAt)}`}
                    fg={splitSelected ? colors.text : colors.textDim}
                  />
                  <text
                    content={`   ${formatTimeHumanReadable(segment.durationSeconds < 60 ? 60 : segment.durationSeconds)}${rounded ? ' (rounded)' : ''}`}
                    fg={splitSelected ? colors.textMuted : colors.textDim}
                  />
                </box>
              );
            })}

            {!reviewContext.hasSplitOptions && (
              <>
                <text content="Not available" fg={colors.textDim} />
                <text content="Requires pauses to create" fg={colors.textDim} />
                <text content="multiple time segments" fg={colors.textDim} />
              </>
            )}
          </box>
        </box>

        <box flexDirection="row" gap={3} marginTop={1}>
          <box flexDirection="row" gap={1}>
            <text content="[enter]" fg={colors.text} />
            <text content="confirm" fg={colors.textDim} />
          </box>
          <box flexDirection="row" gap={1}>
            <text content="[tab/←→]" fg={colors.text} />
            <text
              content={reviewContext.hasSplitOptions ? 'toggle single/split' : 'split unavailable'}
              fg={colors.textDim}
            />
          </box>
          <box flexDirection="row" gap={1}>
            <text content="[esc]" fg={colors.text} />
            <text content="back" fg={colors.textDim} />
          </box>
        </box>
      </box>
    );
  }

  const hints = currentTimer.isPaused
    ? [
        { key: 'r', desc: 'Resume', color: colors.text },
        { key: 's', desc: 'Stop & Log', color: colors.textMuted },
        { key: 'q', desc: 'Quit', color: colors.textDim },
      ]
    : [
        { key: 'p', desc: 'Pause', color: colors.text },
        { key: 's', desc: 'Stop & Log', color: colors.textMuted },
        { key: 'q', desc: 'Quit', color: colors.textDim },
      ];

  const timerColor = currentTimer.isPaused ? colors.textMuted : colors.text;

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
        borderStyle="rounded"
        borderColor={borderColor}
        border
        padding={1}
      >
        <box flexDirection="column" marginBottom={1}>
          <box flexDirection="row" gap={1}>
            <text content="ISSUE:" fg={colors.textLabel} />
            <text content={issue.key} fg={colors.text} />
            <text content={issue.summary} fg={colors.textMuted} />
          </box>
          <box flexDirection="row" gap={1}>
            <text content="STATUS:" fg={colors.textLabel} />
            <text content={issue.status} fg={colors.textMuted} />
          </box>
        </box>

        <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
          <box marginBottom={1}>
            <text content={statusText} fg={statusColor} />
          </box>

          <box flexDirection="row" alignItems="center" justifyContent="center">
            {timeDisplay.split('').map((character, index) => (
              <box
                key={`${character}-${index}`}
                width={character === ':' ? COLON_WIDTH : MAX_DIGIT_WIDTH}
                height={FONT_HEIGHT}
                alignItems="center"
                justifyContent="center"
              >
                <ascii-font text={character} font={ASCII_FONT} color={timerColor} />
              </box>
            ))}
          </box>
        </box>

        {showQuitConfirm && (
          <box
            borderStyle="rounded"
            borderColor={colors.warning}
            border
            padding={1}
            marginTop={1}
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
            gap={1}
          >
            <text content="Discard tracked time without logging?" fg={colors.warning} />
            <text content="[y] discard  [n] continue tracking" fg={colors.textDim} />
          </box>
        )}

        <box flexDirection="row" justifyContent="center" gap={4} marginTop={1}>
          {hints.map((hint) => (
            <box key={hint.key} flexDirection="row" gap={1}>
              <text content={`[${hint.key}]`} fg={hint.color} />
              <text content={hint.desc} fg={colors.textDim} />
            </box>
          ))}
        </box>
      </box>
    </box>
  );
}

function LoggingScreen({
  issueKey,
  entryCount,
  isSingleEntry,
  singleDuration,
  roundedSegmentsCount,
}: {
  issueKey: string;
  entryCount: number;
  isSingleEntry: boolean;
  singleDuration: number;
  roundedSegmentsCount: number;
}) {
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
        gap={1}
        borderStyle="rounded"
        borderColor={colors.border}
        border
      >
        <Spinner frameIndex={spinnerIndex} />
        <box marginTop={1}>
          <text
            content={`logging ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} to ${issueKey}`}
            fg={colors.textMuted}
          />
        </box>

        {isSingleEntry && singleDuration < 60 && (
          <text
            content={`tracked ${formatTimeHumanReadable(singleDuration)} — Jira requires a minimum of 1 minute`}
            fg={colors.textDim}
          />
        )}

        {roundedSegmentsCount > 0 && !isSingleEntry && (
          <text
            content={`${roundedSegmentsCount} short segment${roundedSegmentsCount === 1 ? '' : 's'} will be rounded to 1 minute`}
            fg={colors.textDim}
          />
        )}
      </box>
    </box>
  );
}

function FailureScreen({ message }: { message: string }) {
  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={1}
      backgroundColor={colors.bg}
    >
      <text content={message} fg={colors.error} />
      <text content="The worklog has been saved offline for retry." fg={colors.textMuted} />
    </box>
  );
}

function SuccessScreen({
  issueKey,
  entryCount,
  loggedTime,
  isSingleEntry,
  singleDuration,
  roundedSegmentsCount,
}: {
  issueKey: string;
  entryCount: number;
  loggedTime: string;
  isSingleEntry: boolean;
  singleDuration: number;
  roundedSegmentsCount: number;
}) {
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
        borderColor={colors.success}
        border
      >
        <text
          content={`+ logged ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} (${loggedTime}) to ${issueKey}`}
          fg={colors.success}
        />

        {isSingleEntry && singleDuration < 60 && (
          <box marginTop={1}>
            <text
              content={`tracked ${formatTimeHumanReadable(singleDuration)} — rounded up to Jira's 1 minute minimum`}
              fg={colors.textDim}
            />
          </box>
        )}

        {roundedSegmentsCount > 0 && !isSingleEntry && (
          <box marginTop={1}>
            <text
              content={`${roundedSegmentsCount} short segment${roundedSegmentsCount === 1 ? '' : 's'} rounded up to Jira's 1 minute minimum`}
              fg={colors.textDim}
            />
          </box>
        )}
      </box>
    </box>
  );
}

export async function runInteractiveTimer(options: InteractiveTimerOptions): Promise<TimerResult> {
  const { issue } = options;
  const ownsRenderer = !options.renderer;

  let renderer: CliRenderer;
  if (options.renderer) {
    renderer = options.renderer;
  } else {
    try {
      renderer = await createCliRenderer({
        exitOnCtrlC: false,
        useAlternateScreen: true,
        backgroundColor: colors.bg,
      });
    } catch (error) {
      throw new Error(`Failed to initialize UI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return new Promise<TimerResult>((resolve) => {
    let resolved = false;

    const finish = (result: TimerResult) => {
      if (resolved) {
        return;
      }

      resolved = true;
      if (ownsRenderer) {
        destroyUI(renderer);
      }
      resolve(result);
    };

    const quit = () => {
      stopTimer();
      finish({ action: 'quit' });
    };

    const logWorklog = async (description: string, mode: WorklogMode) => {
      const stoppedTimer = stopTimer();
      if (!stoppedTimer) {
        finish({ action: 'quit' });
        return;
      }

      const elapsed = getElapsedSeconds(stoppedTimer);
      const segments = getWorklogSegments(stoppedTimer);
      const worklogsToPost = buildWorklogsToPost(mode, segments, elapsed, stoppedTimer.startedAt);
      const loggedTimeStr = formatTimeHumanReadable(elapsed < 60 ? 60 : elapsed);
      const roundedSegmentsCount = countRoundedEntries(worklogsToPost);
      const isSingleEntry = worklogsToPost.length === 1;
      const singleDuration = worklogsToPost[0]?.durationSeconds ?? 0;

      renderUI(
        renderer,
        <LoggingScreen
          issueKey={issue.key}
          entryCount={worklogsToPost.length}
          isSingleEntry={isSingleEntry}
          singleDuration={singleDuration}
          roundedSegmentsCount={roundedSegmentsCount}
        />
      );

      let failedCount = 0;
      let firstErrorMessage = '';
      let promptedReauthentication = false;

      for (const entry of worklogsToPost) {
        let posted = false;
        let entryErrorMessage = 'Unknown error';

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await addWorklog(
              stoppedTimer.issueKey,
              entry.durationSeconds,
              description,
              new Date(entry.startedAt),
            );
            posted = true;
            break;
          } catch (error) {
            entryErrorMessage = error instanceof Error ? error.message : 'Unknown error';

            if (!promptedReauthentication && attempt === 0 && isJiraAuthenticationError(error)) {
              promptedReauthentication = true;
              const reauthenticated = await showReauthenticationScreen(renderer);

              if (reauthenticated) {
                renderUI(
                  renderer,
                  <LoggingScreen
                    issueKey={issue.key}
                    entryCount={worklogsToPost.length}
                    isSingleEntry={isSingleEntry}
                    singleDuration={singleDuration}
                    roundedSegmentsCount={roundedSegmentsCount}
                  />
                );
                continue;
              }
            }

            break;
          }
        }

        if (!posted) {
          failedCount++;
          if (!firstErrorMessage) {
            firstErrorMessage = entryErrorMessage;
          }

          addFailedWorklog({
            issueKey: stoppedTimer.issueKey,
            timeSpentSeconds: entry.durationSeconds,
            comment: description,
            started: new Date(entry.startedAt).toISOString(),
            failedAt: Date.now(),
            error: entryErrorMessage,
          });
        }
      }

      if (failedCount > 0) {
        renderUI(
          renderer,
          <FailureScreen
            message={
              failedCount === worklogsToPost.length
                ? `Failed to log time: ${firstErrorMessage}`
                : `Logged ${worklogsToPost.length - failedCount}/${worklogsToPost.length}. ${failedCount} saved offline.`
            }
          />
        );

        await new Promise((resume) => setTimeout(resume, 2500));
        finish({ action: 'error', message: firstErrorMessage || 'Some worklogs failed to post' });
        return;
      }

      renderUI(
        renderer,
        <SuccessScreen
          issueKey={issue.key}
          entryCount={worklogsToPost.length}
          loggedTime={loggedTimeStr}
          isSingleEntry={isSingleEntry}
          singleDuration={singleDuration}
          roundedSegmentsCount={roundedSegmentsCount}
        />
      );

      await new Promise((resume) => setTimeout(resume, 1500));
      finish({ action: 'logged' });
    };

    const handleWorkflowComplete = (result: WorkflowResult) => {
      if (result.action === 'quit') {
        quit();
        return;
      }

      void logWorklog(result.description, result.mode);
    };

    renderUI(
      renderer,
      <TimerWorkflowScreen
        issue={issue}
        defaultDescription={options.defaultDescription}
        onComplete={handleWorkflowComplete}
      />
    );
  });
}
