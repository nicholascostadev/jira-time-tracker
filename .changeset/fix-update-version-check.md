---
"@nicholascostadev/jira-time-tracker": patch
---

Fix `jtt update` to correctly detect when no update is needed and make self-updates complete reliably. The binary version is now embedded at compile time via `--define`, CLI command execution now waits for async update completion, and binary replacement now stages + renames the new executable so installed users can successfully update in place.
