# Jira Time Tracker

A beautiful CLI tool for tracking time and logging worklogs to Jira, built with [Bun](https://bun.sh) and [OpenTUI](https://opentui.com).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Bun](https://img.shields.io/badge/runtime-Bun-black.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue.svg)

## Features

- **Interactive Timer UI** - Beautiful terminal interface with ASCII time display
- **Keyboard Controls** - Pause, resume, stop with single key presses
- **Issue Selection** - Browse and select from your assigned Jira issues
- **Automatic Worklog** - Logs time directly to Jira when you stop the timer
- **Multiple Auth Methods** - Supports both API Token and OAuth 2.0
- **Persistent State** - Timer survives terminal restarts
- **Dark Theme** - Clean, minimal black/white aesthetic

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.0 or higher
- A Jira Cloud account

### Install from source

```bash
# Clone the repository
git clone https://github.com/nicholascostadev/jira-time-tracker.git
cd jira-time-tracker

# Install dependencies
bun install

# Run the CLI
bun run dev --help
```

### Global installation (optional)

```bash
# Link globally
bun link

# Now you can use 'jtt' from anywhere
jtt --help
```

## Configuration

Before using the tracker, you need to configure your Jira credentials.

```bash
bun run dev config
```

### Option 1: API Token (Recommended for personal use)

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Create a new API token
3. Run `jtt config` and select "API Token"
4. Enter your Jira host URL (e.g., `https://yourcompany.atlassian.net`)
5. Enter your email and API token

### Option 2: OAuth 2.0 (Recommended for teams)

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Create a new OAuth 2.0 integration
3. Add the callback URL: `http://localhost:8742/oauth/callback`
4. Add the required scopes:
   - `read:jira-user`
   - `read:jira-work`
   - `write:jira-work`
   - `offline_access`
5. Run `jtt config` and select "OAuth 2.0"
6. Enter your Client ID and Client Secret
7. Authorize in the browser when prompted

### View current configuration

```bash
bun run dev config --show
```

### Clear configuration

```bash
bun run dev config --clear
```

## Usage

### Start tracking time

```bash
# Interactive mode - select from assigned issues
bun run dev start

# Direct mode - specify issue key
bun run dev start PROJ-123

# With description
bun run dev start PROJ-123 -d "Working on feature X"
```

### Timer controls

Once the timer is running, use these keyboard shortcuts:

| Key | Action |
|-----|--------|
| `p` | Pause timer |
| `r` | Resume timer |
| `s` | Stop timer and log time to Jira |
| `q` | Quit without logging |

### Check timer status

```bash
bun run dev status
```

### Resume an existing timer

If you closed the terminal with a timer running:

```bash
bun run dev resume
```

## Commands

| Command | Description |
|---------|-------------|
| `config` | Configure Jira credentials |
| `config --show` | Show current configuration |
| `config --clear` | Clear all configuration |
| `start [issue-key]` | Start tracking time |
| `start -d <desc>` | Start with a description |
| `status` | Show current timer status |
| `resume` | Resume existing timer session |

## Development

### Setup

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Type checking
bun run typecheck

# Run tests
bun run test

# Run tests in watch mode
bun run test:watch
```

### Project Structure

```
src/
├── index.ts              # CLI entry point
├── commands/
│   ├── config.ts         # Configuration command
│   ├── start.ts          # Start timer command
│   ├── status.ts         # Status command
│   └── resume.ts         # Resume timer command
├── services/
│   ├── auth.ts           # Authentication & token refresh
│   ├── config.ts         # Configuration storage
│   ├── jira.ts           # Jira API client
│   ├── oauth.ts          # OAuth 2.0 flow
│   └── timer.ts          # Timer logic
├── ui/
│   ├── theme.ts          # Color theme definitions
│   ├── components.ts     # Reusable UI components
│   └── interactive.ts    # Interactive timer screen
└── types/
    └── index.ts          # TypeScript type definitions
```

### Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript
- **UI Framework**: [OpenTUI](https://opentui.com)
- **CLI Framework**: [Commander.js](https://github.com/tj/commander.js)
- **Jira API**: [jira.js](https://github.com/MrRefactoring/jira.js)
- **Config Storage**: [conf](https://github.com/sindresorhus/conf)
- **Testing**: [Vitest](https://vitest.dev)

### Running Tests

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run specific test file
bun test src/services/timer.test.ts
```

### Releases and versioning

This project uses [Changesets](https://github.com/changesets/changesets) for release management.

```bash
# create a changeset for your PR
bun run changeset

# apply pending version updates locally (optional)
bun run version-packages
```

When changes are merged into `main`, the release workflow creates or updates a version PR. Merging that PR publishes the package and updates release notes.

## Configuration File

The configuration is stored in:

- **Linux**: `~/.config/jira-time-tracker-nodejs/config.json`
- **macOS**: `~/Library/Application Support/jira-time-tracker-nodejs/config.json`
- **Windows**: `%APPDATA%/jira-time-tracker-nodejs/config.json`

## Troubleshooting

### "Not configured" error

Run `jtt config` to set up your Jira credentials.

### OAuth token expired

The CLI automatically refreshes OAuth tokens. If you see authentication errors, try:

```bash
bun run dev config --clear
bun run dev config
```

### Timer not showing

Make sure your terminal supports alternate screen mode. Most modern terminals (iTerm2, Alacritty, Kitty, Windows Terminal) support this.

### API rate limits

Jira Cloud has API rate limits. If you're hitting them, the CLI will show an error message. Wait a few minutes and try again.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

- [OpenTUI](https://opentui.com) for the beautiful terminal UI framework
- [Atlassian](https://www.atlassian.com/) for the Jira API
