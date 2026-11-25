# Specification: Team HQ

**English** · [Русский](TZ.ru.md)

## Task
An own workspace for a small team: tasks, CRM, calendar, daily reports, content and ideas. Each member connects
their Claude and updates the data in plain words. Opens on a phone and a laptop.

## Users
Three founders. Each has a personal access key and a "My day" view.

## First version
| # | Feature | Done when |
|---|---|---|
| 1 | Tables: tasks, leads, events, reports, content, ideas | records can be added, changed and archived |
| 2 | "My day" | overdue, today, blockers, lead steps, events and report status are visible |
| 3 | Boards by status | status changes in one click |
| 4 | Claude (MCP) | "what is on today", add and update a record, send a report |
| 5 | Phone | narrow-screen interface, home screen icon |
| 6 | Telegram notifications | task assigned, blocker, morning summary, evening report reminder |
| 7 | Calendar | subscription in Google or Apple Calendar |
| 8 | History | who changed what is visible |
| 9 | Data transfer | import from CSV and JSON |

## Out of scope
File attachments, roles with different rights, own chat, a store mobile app.

## Rules
- Nothing is deleted for good: records are archived.
- Claude cannot archive or delete.
- Working data and keys never enter the repository.

## Technology
Node.js 24 with no dependencies, SQLite locally, Cloudflare Workers and D1 on a server. The same request-handling
code in both cases.
