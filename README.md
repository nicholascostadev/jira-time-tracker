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

Install latest release binary (macOS arm64 / Linux x64):

```bash
curl -fsSL https://raw.githubusercontent.com/nicholascostadev/jira-time-tracker/main/scripts/install.sh | bash
```

Or download a binary asset manually from GitHub Releases:

- <https://github.com/nicholascostadev/jira-time-tracker/releases>

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

## Usage

Start tracking:

```bash
# Pick from assigned issues
bun run dev start

# Direct issue key
bun run dev start PROJ-123

# With description prefilled
bun run dev start PROJ-123 -d "Refactor timer service"
```

Check status:

```bash
bun run dev status
```

Resume active timer:

```bash
bun run dev resume
```

### Timer Keys

| Key | Action |
|---|---|
| `p` | Pause |
| `r` | Resume |
| `s` | Stop and log |
| `q` | Quit (with confirmation when enough time is tracked) |

## Commands

| Command | Description |
|---|---|
| `config` | Configure Jira credentials |
| `config --show` | Show current config (token masked) |
| `config --clear` | Clear stored credentials |
| `start [issue-key]` | Start a tracking session |
| `status` | Show active timer status |
| `resume` | Resume persisted timer |

## How It Works

- `src/commands/*`: command entry flows (`config`, `start`, `resume`, `status`)
- `src/services/*`: Jira/config/timer/auth/worklog-queue logic
- `src/ui/*`: theme, reusable components, and interactive timer rendering

Core flow:

1. Validate configuration and initialize Jira client
2. Optionally retry queued offline worklogs
3. Select issue and description
4. Track time in full-screen TUI
5. Submit worklog to Jira (minimum 60 seconds enforced)

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
