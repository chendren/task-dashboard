# Task Management System

Full-featured task management with a Trello-style web board, CLI, AI insights, and optional Telegram notifications via OpenClaw.

## Components

| Component | File | Purpose |
|-----------|------|---------|
| Web Dashboard | `server.js` + `public/` | Trello-style board at http://localhost:3000 |
| CLI | `task-manager.js` | Terminal-based task management |
| AI Insights | `task-insights.js` | Gemini-powered productivity analysis |
| Demo Seeder | `seed-demo.js` | Populate 27 demo tasks |
| Reminders | `check-reminders.sh` | Telegram notifications (paused) |

All components share the same SQLite database at `~/.openclaw/workspace/tasks.db`.

## CLI Usage

```bash
# Add a task
node task-manager.js add "Task name" "due-date" "priority" "category"
node task-manager.js add "Buy groceries" "2026-03-01" "high" "personal"

# List all tasks
node task-manager.js list

# Complete a task
node task-manager.js done <task-id>

# Delete a task
node task-manager.js delete <task-id>

# View task details
node task-manager.js view <task-id>

# Show help
node task-manager.js help
```

## Database Schema

**Location:** `~/.openclaw/workspace/tasks.db`

**Tables:**
- `tasks` — Main tasks (name, description, category, priority, dueDate, status, recurring, timeSpent, etc.)
- `subtasks` — Checklist items within tasks
- `notes` — Activity/comment feed per task
- `categories` — Custom categories with colors
- `timeLog` — Start/stop timer entries
- `recurring` — Recurring task patterns
- `status_transitions` — Tracks every column move (for flow analytics)
- `settings` — Key-value store (encrypted API keys, preferences)
- `wip_limits` — Per-column work-in-progress limits

**Task statuses:** `backlog`, `pending`, `completed`, `archived`

**Priorities:** `low`, `medium`, `high`

## Integration with OpenClaw

The task system lives in OpenClaw's workspace directory. Cascade (the AI agent) can:
- Add and manage tasks via the CLI
- Query the REST API programmatically
- Send task notifications via Telegram
- Run the AI insights analysis

### Telegram Notifications

```bash
openclaw message send --channel telegram --target REDACTED_TELEGRAM_USER_ID \
  --message "Task reminder: Buy groceries"
```

### Cron Integration

```bash
# Daily task summary at 9am
0 9 * * * cd ~/.openclaw/workspace && node task-manager.js list

# Recurring task generator at 6am
0 6 * * * cd ~/.openclaw/workspace && node task-manager.js recurring-check
```

## Reminder System (Currently Paused)

Scripts: `check-reminders.sh`, `send-reminders.sh`, `reminder-daemon.sh`
Database: `reminders.json`
Status: Disabled — was sending duplicate notifications. Can be re-enabled.
