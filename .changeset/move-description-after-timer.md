---
"@nicholascostadev/jira-time-tracker": minor
---

Move worklog description prompt to after the timer stops instead of before it starts. The timer now begins immediately after selecting an issue, and the description is entered when you press [s] to stop and log. Pressing [esc] on the description screen resumes the timer with no time lost.

Add default worklog message support. Set a default via `jtt config --default-message "message"` or toggle "save as default" with [tab] on the description screen. The default pre-fills the description input on future worklogs.
