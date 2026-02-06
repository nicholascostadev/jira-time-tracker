# @nicholascostadev/jira-time-tracker

## 0.1.0

### Minor Changes

- 7c33ff5: Move worklog description prompt to after the timer stops instead of before it starts. The timer now begins immediately after selecting an issue, and the description is entered when you press [s] to stop and log. Pressing [esc] on the description screen resumes the timer with no time lost.

  Add default worklog message support. Set a default via `jtt config --default-message "message"` or toggle "save as default" with [tab] on the description screen. The default pre-fills the description input on future worklogs.

### Patch Changes

- 900f1ab: Fix `jtt update` skipping the version check and always re-downloading the same release. The version is now reliably embedded in compiled binaries via `--define` at build time, so the update command correctly detects when you're already on the latest version and skips the download.

## 0.0.2

### Patch Changes

- 8dd97d0: Fix release automation so binary build workflow is always triggered after a version tag is created, and add manual workflow dispatch support for rebuilding assets for an existing tag.

## 0.0.1

### Patch Changes

- cf19737: Add a dummy patch changeset to trigger the first release flow and publish version 0.0.1.
- d89f4ad: Switch release distribution from npm publishing to GitHub Release binaries, including automated build artifacts and a curl-based installer script.

## 2.0.1

### Patch Changes

- 444cb1f: Set up Changesets-based release automation, including a GitHub Actions release workflow and contributor docs for branch/PR/release flow.
