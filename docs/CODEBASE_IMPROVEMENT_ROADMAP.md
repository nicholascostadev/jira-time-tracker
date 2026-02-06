# Jira Time Tracker - Codebase Improvement Roadmap

## 1) Current State Snapshot

This project already has a strong foundation:

- Clear module boundaries (`commands`, `services`, `ui`, `types`)
- Good TypeScript hygiene (strict mode, explicit interfaces)
- Strong service-level test coverage (config, timer, jira, oauth, auth, queue)
- Thoughtful terminal UX baseline (consistent theme, reusable components, focused interaction loops)

Main opportunities are no longer "core functionality"; they are now around reliability hardening, consistency, and interaction polish.

## 2) What Can Be Improved (Prioritized)

### P0 - Reliability and Security (Do First)

1. OAuth flow hardening
   - Add OAuth `state` validation (and PKCE if Jira app configuration supports it) to reduce callback spoofing/CSRF risk.
   - Why: Highest impact risk reduction for authentication flows.

2. Event/listener lifecycle cleanup
   - Ensure signal and key listeners are always removed when leaving interactive screens.
   - Why: Prevent subtle long-session bugs and duplicate handlers.

3. Network timeout and retry policy
   - Add request timeout wrappers for Jira/OAuth calls.
   - Use bounded retries with backoff for transient failures.
   - Why: Better behavior for flaky network/VPN environments.

### P1 - UX Consistency and Interaction Quality

1. Standardize key behavior across screens
   - Make `Esc`, `q`, and `Enter` semantics predictable in every mode.
   - Keep a fixed footer that always explains current key meanings.

2. Protect users from losing tracked time
   - Add confirmation when quitting/discarding after meaningful elapsed time.
   - Why: Prevent accidental data loss.

3. Improve issue selection discoverability
   - Add explicit search focus key (for example `/`).
   - Show active filter badges and clear-filter shortcut.
   - Why: Faster selection and lower cognitive load.

4. Surface offline queue status in TUI
   - Display pending count + retry status in active screens.
   - Why: Users trust the tool more when sync state is visible.

### P2 - Maintainability and Performance

1. Reduce duplicated screen plumbing
   - Extract shared renderer/screen helpers used across command flows.
   - Why: Easier maintenance and fewer UX regressions.

2. Optimize timer render path
   - Cache stable ASCII measurement/calculation work done every tick.
   - Why: Lower CPU overhead and smoother UI.

3. Tighten persisted-state validation
   - Validate loaded timer/config payloads at runtime before using them.
   - Why: Better resilience to corrupted local state.

4. Documentation alignment
   - Keep README operational details synchronized with actual config/runtime behavior.
   - Why: Better onboarding and less support friction.

## 3) UX/UI Ideas You Could Implement

### High-Impact UX Improvements

- Mode-aware footer (always visible): current mode + exact key mappings.
- Exit/discard confirmation: only shown when elapsed time exceeds threshold.
- Success decision screen: after worklog submit, offer:
  - `[Enter] Track another`
  - `[q] Quit`
- Better long-text handling:
  - Truncate issue summary/description with ellipsis in dense layouts.
  - Optional details popup for full text.
- Terminal size guard:
  - Minimum supported size check with friendly warning screen.

### Nice-to-Have UX Enhancements

- Optional "Recent issues" section before full issue list.
- Saved default filters (status/search) between sessions.
- Lightweight command palette (`:`) for advanced actions.
- Configurable keybindings for power users.

## 4) Testing Improvements

Current tests are good for services; next step is interaction confidence.

1. Add integration tests for command flows:
   - `start` happy path
   - `resume` with persisted state
   - offline queue fallback + retry
2. Add contract tests around cleanup behavior:
   - listeners detached on transitions
   - renderer destroyed safely on exits
3. Add failure-path scenarios:
   - token refresh fail + recovery
   - Jira API timeout/retry behavior

## 5) Suggested Execution Plan

### Quick Wins (1-3 days)

- Add quit/discard confirmation for active timers.
- Add explicit search/focus and clear-filter shortcuts in issue list.
- Add persistent footer key hints per screen.
- Add timeouts for network calls.
- Patch README/config docs drift.

### Foundation Sprint (1-2 weeks)

- Introduce shared screen framework utilities (loading/error/layout lifecycle).
- Normalize key semantics (`Esc`, `q`, `Enter`) across all screens.
- Add integration tests for primary command flows.

### Hardening Sprint (2+ weeks)

- OAuth state/PKCE strengthening.
- Queue observability and retry policies.
- Additional defensive runtime validation for loaded persisted state.

## 6) Decision Guide - What You Should Choose First

If you only pick one direction now, choose:

**Reliability + UX safety first** (P0 + top P1).

Why this is the best next move:

- It reduces the highest user pain (lost time, uncertain sync, flaky network behavior).
- It lowers production risk without requiring major rewrites.
- It sets a stable base for future feature work.

Recommended first milestone:

1. Quit/discard confirmation
2. Network timeout + retry baseline
3. Listener lifecycle cleanup
4. Consistent keymap footer across screens

After that, move into shared screen architecture and integration testing.
