# Task Dashboard

Beautiful web UI for managing tasks on your Raspberry Pi.

## Quick Start

```bash
# Start the dashboard server
cd ~/.openclaw/workspace
node server.js

# Or use the startup script
./start-dashboard.sh

# Then visit: http://localhost:3000
```

Server runs on port 3000 by default. You can change it:
```bash
PORT=8080 node server.js
```

## Features

✅ **Task Management**
- Create, read, update, delete tasks
- Mark tasks as pending/completed
- Organize by category
- Set priorities (high, medium, low)
- Add due dates with smart formatting

✅ **Filtering & Search**
- Search tasks by name
- Filter by status (pending, completed, archived)
- Filter by category
- Filter by priority

✅ **Statistics**
- Total tasks count
- Pending tasks count
- Completed tasks count
- Categories list

✅ **UI/UX**
- Dark theme (easy on the eyes at night)
- Responsive design (works on mobile, tablet, desktop)
- Color-coded priorities (🔴 🟡 🟢)
- Due date warnings (shows overdue tasks)
- Real-time updates (refreshes every 10 seconds)

## API Endpoints

All endpoints return JSON.

**GET /api/tasks**
- List all tasks
- Query params: status, category, priority, search
- Example: `/api/tasks?status=pending&priority=high`

**POST /api/tasks**
- Create new task
- Body: `{name, description?, category?, priority?, dueDate?}`

**GET /api/tasks/:id**
- Get single task details

**PUT /api/tasks/:id**
- Update task
- Body: `{name?, description?, category?, priority?, dueDate?, status?}`

**DELETE /api/tasks/:id**
- Delete task

**GET /api/stats**
- Get statistics (total, pending, completed, categories)

## Browser Access

From the Pi:
- Open browser to: `http://localhost:3000`

From another device on same network:
- Get Pi IP: `hostname -I`
- Open: `http://<pi-ip>:3000`
- Example: `http://192.168.1.100:3000`

## Running in Background

```bash
# Run in background with nohup
nohup node server.js > dashboard.log 2>&1 &

# Run with systemd (persistent across reboots)
# Create /etc/systemd/system/task-dashboard.service
```

## Technology Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (existing)
- **Frontend:** Vanilla JavaScript (no frameworks)
- **Styling:** Pure CSS with dark theme
- **Updates:** Real-time polling every 10 seconds

## Integrations

### With Task Manager CLI

Both use the same SQLite database, so they sync automatically:
```bash
# Add task via CLI
node task-manager.js add "My task"

# See it appear in dashboard immediately
```

### With Telegram

Update `server.js` to send notifications:
```javascript
// On task completion, send to Telegram
openclaw message send --channel telegram --target REDACTED_TELEGRAM_USER_ID \
  --message "✅ Task ${task.name} completed!"
```

## Customization

### Change theme
Edit `public/index.html` and modify the CSS variables at the top of the `<style>` section.

### Change port
```bash
PORT=8080 node server.js
```

### Database location
Edit `server.js` line 15:
```javascript
const dbPath = '/custom/path/to/tasks.db';
```

## Troubleshooting

**Port already in use:**
```bash
lsof -i :3000  # See what's using the port
PORT=3001 node server.js  # Use a different port
```

**Database locked:**
- Close the dashboard and try again
- Only one write operation at a time

**Tasks not appearing:**
- Refresh the browser (Cmd/Ctrl + R)
- Check dashboard console (F12 → Console)
- Ensure database exists at `~/.openclaw/workspace/tasks.db`

**Slow on Pi:**
- Expected — Pi is modest hardware
- Reduce refresh rate in `public/app.js` line 25

## Files

- `server.js` - Express backend server
- `public/index.html` - UI layout and styling
- `public/app.js` - Frontend logic and API calls
- `start-dashboard.sh` - Quick start script
- `DASHBOARD.md` - This file
