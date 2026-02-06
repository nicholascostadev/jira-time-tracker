# Jira Time Tracker (`jtt`)

Terminal-first Jira time tracking with a full-screen TUI, persistent timers, and direct worklog submission.

## Why This Tool

`jtt` is built for developers who want to log Jira work without leaving the terminal:

- Pick from assigned issues or enter a key manually
- Start/pause/resume/stop with single-key controls
- Log work directly to Jira with minimum-time handling
- Recover safely from network failures with offline queue + retry
- Resume timers after closing the terminal

## Highlights

- API token authentication only (simple and explicit)
- Interactive TUI powered by `@opentui/core`
- Persistent state via `conf`
- Offline worklog queue with retry on startup/resume
- Request timeout and retry handling for issue search
- Strong service-level test coverage with Vitest

## Requirements

- Bun `>= 1.0`
- Jira Cloud account
- Jira API token

Create your API token at:

- <https://id.atlassian.com/manage-profile/security/api-tokens>

## Installation

Install latest release binary (macOS arm64 / Linux x64) to your user directory:

```bash
curl -fsSL https://raw.githubusercontent.com/nicholascostadev/jira-time-tracker/main/scripts/install.sh | bash
```

The installer defaults to `$HOME/.local/bin`.

To override install path:

```bash
curl -fsSL https://raw.githubusercontent.com/nicholascostadev/jira-time-tracker/main/scripts/install.sh | INSTALL_DIR="/custom/bin" bash
```

If needed, add it to your `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Verify install:

```bash
jtt --help
```

### Update

Update to the latest release with the same installer:

```bash
curl -fsSL https://raw.githubusercontent.com/nicholascostadev/jira-time-tracker/main/scripts/install.sh | bash
```

Or update directly from the installed CLI:

```bash
jtt update
```

Manual update:

1. Download the newest release asset from GitHub Releases.
2. Extract it.
3. Replace your existing `jtt` binary on `PATH`.

Download manually from GitHub Releases:

- <https://github.com/nicholascostadev/jira-time-tracker/releases>

If you install manually, place the binary on your `PATH` as `jtt`.

Example (Linux x64):

```bash
tar -xzf jtt-vX.Y.Z-linux-x64.tar.gz
sudo install -m 755 jtt /usr/local/bin/jtt
```

Example (macOS arm64):

```bash
tar -xzf jtt-vX.Y.Z-macos-arm64.tar.gz
sudo install -m 755 jtt /usr/local/bin/jtt
```

Build from source (development):

```bash
git clone https://github.com/nicholascostadev/jira-time-tracker.git
cd jira-time-tracker
bun install
```

Run locally:

```bash
bun run dev --help
```

Optional global link:

```bash
bun link
jtt --help
```

## Configuration

Configure Jira once:

```bash
jtt config
```

If running from source in development mode, use:

```bash
bun run dev config
```

The setup flow asks for:

1. Jira host (for example `https://yourcompany.atlassian.net`)
2. Jira email
3. Jira API token

Useful config commands:

```bash
bun run dev config --show
bun run dev config --clear
```

### Default worklog message

Set a default description that pre-fills the worklog prompt when you stop a timer:

```bash
jtt config --default-message "Working on task"
```

Clear it:

```bash
jtt config --default-message ""
```

You can also toggle "save as default" directly from the description prompt when stopping a timer (press `Tab`).

## Usage

Start tracking:

```bash
# Pick from assigned issues
jtt start

# Direct issue key
jtt start PROJ-123

# Pre-fill the worklog description (prompted when you stop)
jtt start PROJ-123 -d "Refactor timer service"
```

Check status:

```bash
jtt status
```

Resume active timer:

```bash
jtt resume
```

Development equivalents:

```bash
bun run dev start
bun run dev status
bun run dev resume
```

### Timer Keys

| Key | Action |
|---|---|
| `p` | Pause |
| `r` | Resume |
| `s` | Stop — opens description prompt, then review |
| `q` | Quit (with confirmation when enough time is tracked) |

### Description prompt keys (after pressing `s`)

| Key | Action |
|---|---|
| `Enter` | Submit description and open review |
| `Tab` | Toggle "save as default" |
| `Esc` | Cancel and resume the timer |

### Worklog review keys (after description submit)

| Key | Action |
|---|---|
| `Enter` | Confirm and log worklog(s) |
| `Tab` / `Left` / `Right` | Toggle single vs split entries |
| `Esc` | Back to description |

## Commands

| Command | Description |
|---|---|
| `config` | Configure Jira credentials |
| `config --show` | Show current config (token masked, default message) |
| `config --clear` | Clear stored credentials |
| `config --default-message <msg>` | Set default worklog message (use `""` to clear) |
| `start [issue-key]` | Start a tracking session |
| `start -d <description>` | Pre-fill the worklog description |
| `status` | Show active timer status |
| `resume` | Resume persisted timer |
| `update` | Update to latest released binary |

## How It Works

- `src/commands/*`: command entry flows (`config`, `start`, `resume`, `status`)
- `src/services/*`: Jira/config/timer/auth/worklog-queue logic
- `src/ui/*`: theme, reusable components, and interactive timer rendering

Core flow:

1. Validate configuration and initialize Jira client
2. Optionally retry queued offline worklogs
3. Select issue
4. Track time in full-screen TUI
5. Enter worklog description when stopping (pre-filled with default if set)
6. Review single-entry vs split-entry posting (split defaults when multiple segments exist)
7. Submit worklog(s) to Jira (minimum 60 seconds enforced per entry)

## Development

```bash
bun run typecheck
bun run test
```

Project scripts:

- `bun run dev`
- `bun run typecheck`
- `bun run test`
- `bun run test:watch`

### Releases and versioning

This project uses [Changesets](https://github.com/changesets/changesets) for release management.

```bash
# create a changeset for your PR
bun run changeset

# apply pending version updates locally (optional)
bun run version-packages
```

When changes are merged into `main`, the release workflow creates or updates a version PR. Merging that PR creates a git tag, builds platform binaries, and publishes them as GitHub Release assets.


## Troubleshooting

- `Not configured`: run `jtt config`
- `Authentication failed`: verify host/email/token and run `jtt config` again
- `No active timer`: run `jtt start`
- Network failures during logging: worklog is queued and retried automatically

## License

MIT. See `LICENSE`.
