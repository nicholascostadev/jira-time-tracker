---
"@nicholascostadev/jira-time-tracker": patch
---

Fix `jtt update` reliability for existing installs. The CLI now waits for async command completion (`parseAsync`), and updater downloads are written from `arrayBuffer` before replacing the binary with a staged rename. This prevents update hangs and ensures installed binaries are replaced correctly.
