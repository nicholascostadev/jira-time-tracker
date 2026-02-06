# Jira Time Tracker (`jtt`)

## What This Is

A terminal-based Jira time tracker built with Bun + TypeScript. It provides a full-screen TUI (terminal UI) for selecting Jira issues, timing work, and posting worklogs — all without leaving the terminal.

## Tech Stack

- **Runtime**: Bun (runs TypeScript directly, no build step)
- **Language**: TypeScript (strict mode, ESM with `.js` import extensions)
- **TUI Framework**: `@opentui/core` — immediate-mode TUI rendering
- **CLI Framework**: Commander.js
- **Jira Client**: `jira.js` (Version2Client) + raw `fetch` for search endpoint
- **Config Storage**: `conf` (persistent JSON config on disk)
- **Testing**: Vitest

## Project Structure

```
src/
  index.ts                  # CLI entry point — Commander.js program with 4 commands
  types/
    index.ts                # All TypeScript interfaces and type aliases
  commands/
    config.ts               # `jtt config` — interactive TUI setup wizard
    start.ts                # `jtt start` — issue selection + timer (main interactive loop)
    status.ts               # `jtt status` — console output of active timer state
    resume.ts               # `jtt resume` — resume a persisted timer
  services/
    auth.ts                 # ensureAuthenticated() — validates config + initializes Jira client
    config.ts               # Persistent config via `conf` library (credentials + timer state)
    jira.ts                 # Jira API client (issue fetch, worklog posting, search, connection test)
    timer.ts                # Timer state machine (create, pause, resume, stop, elapsed calculation)
    *.test.ts               # Unit tests for each service
  ui/
    theme.ts                # Color palette, status colors, preset component styles
    components.ts           # Reusable TUI components (Header, Panel, Spinner, etc.)
    interactive.ts          # Full-screen interactive timer screen with ASCII clock
```

## Commands

| Command | Description |
|---|---|
| `jtt config` | Interactive API token setup wizard. `--show` prints config, `--clear` deletes it. |
| `jtt start [issue-key]` | Main workflow: select issue -> enter description -> timer -> log -> loop back |
| `jtt status` | Console output of active timer state (non-interactive) |
| `jtt resume` | Resume a persisted timer that survived terminal closure |

## How to Run

```bash
bun install
bun run dev start           # Interactive mode
bun run dev start PROJ-123  # Direct issue
bun run dev config          # Setup credentials
bun run dev status          # Check timer
bun run dev resume          # Resume saved timer
bun run typecheck           # Type checking
bun run test                # Run tests
```

## Git Workflow & Releases

- Never push directly to `main`.
- Every code or documentation change must be done on a branch and proposed via Pull Request.
- Preferred flow for contributors and agents:
  1. Create a new branch from `main`
  2. Make changes
  3. Add a changeset with `bun run changeset` when the change should be released
  4. Open a PR to `main`
  5. After PR merge, let Changesets create/update the release PR
  6. Merge the release PR to create a version tag and trigger binary builds
  7. Download release artifacts from GitHub Releases (or use the install script)
- Releases are distributed through GitHub Releases assets (no npm publish step).
- Do not merge PRs automatically unless explicitly requested by the user/repository maintainer.

## Architecture & Key Patterns

### TUI Rendering (OpenTUI)

The TUI uses `@opentui/core` with this pattern throughout:

1. Create renderer via `createCliRenderer({ useAlternateScreen, exitOnCtrlC, backgroundColor })`
2. Build UI as a tree of `Box()`, `Text()`, `Input()`, `Select()`, `ASCIIFont()` nodes
3. Mount to `renderer.root.add(ui)`
4. Re-render = clear all children + rebuild entire tree + re-add (immediate mode)
5. Keyboard input via `renderer.keyInput.on('keypress', handler)`
6. Cleanup via `renderer.destroy()`

### Shared Renderer Pattern

The `start` command creates **one renderer** reused across all screens (loading -> issue select -> description input -> timer -> success -> back to select). This eliminates flickering between page transitions. Each screen removes prior listeners with `renderer.keyInput.removeAllListeners('keypress')` and calls `clearRenderer()` before building its own UI.

The `resume` and `config` commands each create their own renderers.

### Focus Management

After rendering, a `setTimeout(fn, 50)` finds target components by string ID via `renderer.root.findDescendantById()`, casts to `SelectRenderable` or `InputRenderable`, and calls `.focus()`.

### Continuous Tracking Loop

`startCommand` wraps the full flow in a `while(true)` loop. After the timer logs a worklog, it shows a success screen, re-fetches issues, and returns to issue selection — rather than exiting.

`runInteractiveTimer` returns `{ action: 'logged' | 'quit' | 'error' }` — the loop continues on `'logged'`/`'error'` and exits on `'quit'`.

### Timer Persistence

Timer state is stored on disk via the `conf` library. This means:
- Timers survive terminal closure (`jtt resume` picks them up)
- The interactive timer re-reads state from disk every second during display
- `stopTimer()` clears the persisted state

### Error Handling in TUI

Loading screens (`showLoadingScreen` in start.ts) catch errors and show an error screen with `[r] retry / [q] quit` instead of crashing. This prevents terminal escape sequence garbage that would appear if the renderer is destroyed during pending stdin reads.

### Stdin Drain Pattern

A repeated cleanup pattern before `process.exit`: briefly set stdin to raw mode, consume any pending terminal capability response bytes, then exit after a 200ms delay. This prevents escape codes from leaking to the parent shell.

## Jira Integration

### Authentication

Single method:

- **API Token**: Basic auth (`email:apiToken`). Host = direct Jira URL.

### API Calls

| Operation | API | Library |
|---|---|---|
| Get issue | REST API v2 `/issue/{key}` | jira.js |
| Add worklog | REST API v2 `/issue/{key}/worklog` | jira.js |
| Test connection | REST API v2 `/myself` | jira.js |
| Search assigned issues | REST API v3 `/search/jql` (POST) | raw fetch |
| Get current user | REST API v2 `/myself` | jira.js |

Worklog posting enforces a 60-second minimum (Jira API requirement). The UI shows an explanatory note when elapsed time is under 1 minute.

## Theme System

Dark theme (pure black `#000000` background) with zinc-scale grays for text hierarchy:

- `text` (#FAFAFA) — primary
- `textLabel` (#D4D4D8) — labels like "ISSUE:", "STATUS:"
- `textMuted` (#A1A1AA) — secondary content
- `textDim` (#71717A) — hints, key descriptions

Status colors map Jira statuses to colored badge-style pills. Unknown statuses get auto-assigned colors from a fallback palette, consistent within a session.

Preset style objects (`boxStyles`, `selectStyles`, `inputStyles`) are spread into components for consistent styling.

## UI Components (`src/ui/components.ts`)

- **Header**: Centered "JIRA TIME TRACKER" with rounded border
- **Panel**: Generic bordered container with optional title
- **Spinner**: 3 bouncing block dots (`███`), cycling at 300ms
- **TimerDisplay**: Large ASCII font clock via `ASCIIFont({ font: 'block' })`
- **StatusItem**: Label-value pair row
- **KeyHint / KeyHintsRow**: `[key] description` hints
- **MessageBox**: Bordered message with semantic icon (info/success/warning/error)
- **IssueDisplay**: Two-line issue display (key + summary, status)

## Interactive Timer (`src/ui/interactive.ts`)

The timer screen shows:
- Issue info (key, status, description) with uppercase labels
- Running/paused status badge
- Large ASCII clock where each digit is rendered in a fixed-width cell (prevents layout shifts)
- Key hints: `[p] pause`, `[r] resume`, `[s] stop & log`, `[q] quit`

On stop & log: shows spinner -> posts worklog -> shows success screen -> returns `{ action: 'logged' }`.
On worklog failure: saves to offline queue -> shows error screen -> returns `{ action: 'error' }`.

## Issue Selection (`src/commands/start.ts`)

The issue selection screen includes:
- **Status filter pills**: Left/Right arrows or Tab/Shift+Tab cycles through statuses. Colors derived from the issues' statuses. Done statuses are filtered out. Counts update dynamically based on the current search query.
- **Live search**: Custom keyboard capture (not an Input component) filters by issue key, summary, and status. Backspace deletes, Escape clears search first then cancels.
- **Select component**: OpenTUI `Select` with the filtered issue list. Up/Down navigates, Enter selects.
- **Manual entry**: "Enter issue key" option at the bottom for issues not in the list.

## Testing

Tests are colocated with services (`src/services/*.test.ts`). Run with `bun run test`.

- Config, timer, jira, auth, and queue services are all tested
- Tests use `vi.mock()` with factory functions
- Timer tests use `vi.useFakeTimers()` for deterministic time
- Config tests mock the `conf` library with an in-memory store
- Jira tests mock the `jira.js` client and global `fetch`

## Known Issues & Tech Debt

_All previously tracked issues have been resolved._
