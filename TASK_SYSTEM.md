# Task Management System

Full-featured task management with Telegram integration. Stores tasks in SQLite and sends updates via Telegram.

## Quick Start

```bash
# List all tasks
node task-manager.js list

# Add a task
node task-manager.js add "Task name" "due-date" "priority" "category"
# Example:
node task-manager.js add "Buy groceries" "2026-02-25" "high" "personal"

# Complete a task
node task-manager.js done <task-id>

# Delete a task  
node task-manager.js delete <task-id>

# View task details
node task-manager.js view <task-id>

# Show help
node task-manager.js help
```

## Database

**Location:** `~/.openclaw/workspace/tasks.db`

**Tables:**
- `tasks` - Main tasks table with all fields
- `categories` - Custom task categories
- `recurring` - Recurring task patterns
- `timeLog` - Time tracking entries

## Task Fields

- **id:** Auto-increment identifier
- **name:** Task description (required)
- **description:** Extended notes
- **category:** Organize tasks (default: "general")
- **priority:** low, medium, high
- **dueDate:** YYYY-MM-DD format
- **status:** pending, completed, archived
- **recurring:** daily, weekly, monthly, yearly
- **timeSpent:** Total seconds tracked
- **createdAt:** Timestamp
- **completedAt:** When task was finished
- **startedAt:** When timer started

## Integration with OpenClaw

To integrate with Telegram commands, create aliases:

```bash
# Add to your shell aliases or cron
alias task="node ~/.openclaw/workspace/task-manager.js"
```

Then use:
```
/task list
/task add "name" "2026-02-25" "high" "work"
/task done 1
```

## Features (Implemented & Planned)

✅ **Core**
- Create, list, complete, delete tasks
- Priorities and categories
- Due dates
- Task descriptions
- Telegram notifications

🔄 **In Progress**
- Recurring tasks
- Time tracking
- Search/filter
- Web dashboard
- Archive old tasks
- Categories management

## Examples

**Add a work task due Friday**
```
node task-manager.js add "Finish report" "2026-02-28" "high" "work"
```

**List all high-priority tasks**
```
node task-manager.js list
# Filter by priority in UI
```

**Complete task #3**
```
node task-manager.js done 3
```

**View details of task #1**
```
node task-manager.js view 1
```

## Cron Jobs (Optional)

Run daily reminder:
```bash
0 9 * * * node ~/.openclaw/workspace/task-manager.js list | \
  openclaw message send --channel telegram --target REDACTED_TELEGRAM_USER_ID --message "$(cat)"
```

Recurring task generator:
```bash
0 6 * * * node ~/.openclaw/workspace/task-manager.js recurring-check
```

## Troubleshooting

**Database locked:** Only one process can write at a time
```bash
# Wait a few seconds and retry
```

**Command not found:** Make sure you're in the workspace directory
```bash
cd ~/.openclaw/workspace
node task-manager.js list
```

**Messages not sending:** Check Telegram bot is connected
```bash
openclaw status | grep Telegram
```
