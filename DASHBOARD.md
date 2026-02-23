# Task Dashboard

Trello-style task board running locally on the Raspberry Pi. Dark theme, drag-and-drop, card detail modals — the works.

## Quick Start

```bash
cd ~/.openclaw/workspace
node server.js

# Or use the startup script
./start-dashboard.sh

# Then visit: http://localhost:3000
# From other devices: http://REDACTED_HOST:3000
```

## Architecture

```
server.js          → Express REST API + SQLite (one file, ~1400 lines)
public/index.html  → Layout + CSS (Trello-style board, dark theme)
public/app.js      → All frontend logic (board, cards, modals, drag-drop)
tasks.db           → SQLite database (shared with CLI and insights script)
```

No frameworks, no build step, no transpilation. Plain Node.js + vanilla JS.

## Board Layout

- **Header** (48px): Board title, inline stats, compact filters, "..." menu
- **Board canvas**: Horizontally scrollable, four 272px columns
- **Columns**: Backlog → Pending → Completed → Archived
- **Cards**: Compact with label bars, title, badge icons, hover pencil
- **Card detail**: Two-column modal (main content + action sidebar)

## API Endpoints

**Tasks**
- `GET /api/tasks` — List all (query: status, category, priority, search)
- `POST /api/tasks` — Create (body: name, description?, category?, priority?, dueDate?, status?)
- `GET /api/tasks/:id` — Get one
- `PUT /api/tasks/:id` — Update
- `DELETE /api/tasks/:id` — Delete

**Subtasks**
- `GET /api/tasks/:id/subtasks` — List subtasks
- `POST /api/tasks/:id/subtasks` — Add subtask
- `PUT /api/subtasks/:id` — Update subtask
- `DELETE /api/subtasks/:id` — Delete subtask

**Notes**
- `GET /api/tasks/:id/notes` — List notes
- `POST /api/tasks/:id/notes` — Add note
- `DELETE /api/notes/:id` — Delete note

**Time Tracking**
- `POST /api/tasks/:id/timer/start` — Start timer
- `POST /api/tasks/:id/timer/stop` — Stop timer
- `GET /api/tasks/:id/time-logs` — Get time logs

**Categories**
- `GET /api/categories` — List categories
- `POST /api/categories` — Add category
- `PUT /api/categories/:id` — Update category
- `DELETE /api/categories/:id` — Delete category

**Analytics & Stats**
- `GET /api/stats` — Task counts and category breakdown
- `GET /api/analytics/flow` — Status transitions over 30 days
- `GET /api/analytics/cumulative-flow` — Stacked area data
- `GET /api/analytics/cycle-time` — Average time per status
- `GET /api/due-summary` — Overdue and upcoming tasks

**Other**
- `GET /api/insights` — AI productivity analysis (requires Gemini key)
- `GET /api/settings` — Get settings
- `POST /api/settings` — Save settings
- `POST /api/test-key` — Test Gemini API key
- `GET /api/wip-limits` — Get WIP limits
- `POST /api/wip-limits` — Save WIP limits
- `GET /api/export` — Export all data as JSON
- `POST /api/import` — Import data from JSON
- `POST /api/tasks/bulk-action` — Bulk complete/delete/update

## Integrations

### With Task Manager CLI

Same SQLite database, instant sync:
```bash
node task-manager.js add "My task" "2026-03-01" "high" "work"
# Appears on the board within 10 seconds (or on refresh)
```

### With AI Insights

```bash
GEMINI_API_KEY=your-key node task-insights.js
# Or configure in Settings → board saves the key encrypted
```

### With Telegram (via OpenClaw)

Reminder scripts can send notifications:
```bash
openclaw message send --channel telegram --target REDACTED_TELEGRAM_USER_ID \
  --message "Task completed!"
```

## Running in Background

```bash
nohup node server.js > dashboard.log 2>&1 &
```
