---
"@nicholascostadev/jira-time-tracker": patch
---

Fix `jtt update` skipping the version check and always re-downloading the same release. The version is now reliably embedded in compiled binaries via `--define` at build time, so the update command correctly detects when you're already on the latest version and skips the download.
