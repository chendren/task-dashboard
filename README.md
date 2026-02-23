# Task Dashboard

A personal task management app that runs locally on your machine. No accounts, no cloud, no subscriptions — just a clean dashboard for keeping track of what you need to do.

Built with Node.js, SQLite, and plain JavaScript. Nothing fancy to install, nothing that phones home. Your data stays on your computer.

## What it looks like

A dark-themed web interface with a Kanban board, task lists, analytics, and AI-powered insights — all running from a single `node server.js` command.

You get four columns on the Kanban board:

- **Backlog** — ideas and things you're not ready to commit to yet
- **Pending** — what you're actively working on
- **Completed** — things you've finished
- **Archived** — done and out of sight

Drag tasks between columns. Click to edit. That's most of it.

## Why this exists

Most task apps want you to create an account, pay for features, or live inside someone else's ecosystem. This one is different. It's a single-page app backed by a SQLite file on your own machine. You own everything.

It started as a simple to-do list and grew into something more useful:

- You can break tasks into subtasks and track progress on each one
- You can set due dates and get visual warnings when things are overdue
- You can track how long you spend on tasks with a built-in timer
- You can set up recurring tasks (daily, weekly, monthly) so routine things re-appear automatically
- You can organize by categories and priorities
- You can add notes to tasks as you work through them
- You can view analytics that show how your tasks flow through the board over time
- You can ask an AI to analyze your task data and give you a productivity report

None of these features require an internet connection except the AI insights (which calls the Gemini API).

## Getting started

You'll need [Node.js](https://nodejs.org/) installed (version 18 or newer, for the built-in `fetch` support).

```bash
# Clone the repo
git clone https://github.com/chendren/task-dashboard.git
cd task-dashboard

# Install dependencies
npm install

# Start the server
node server.js
```

Then open your browser to **http://localhost:3000**

That's it. The database is created automatically the first time you run it. No setup, no configuration files, no environment variables needed to get going.

### Changing the port

```bash
PORT=8080 node server.js
```

### Running in the background

```bash
nohup node server.js > dashboard.log 2>&1 &
```

### Accessing from other devices on your network

Find your machine's IP address (`hostname -I` on Linux, or check your network settings), then visit `http://your-ip:3000` from any device on the same network. Works well on tablets and phones too — the layout is responsive.

## Features in more detail

### Kanban board

The main view is a four-column Kanban board. Drag and drop tasks between columns to change their status. Each card shows the task name, priority, category, due date, and how old the task is. Cards that have been sitting for a while get a visual age indicator so you can spot things that might be stuck.

You can set WIP (work-in-progress) limits on columns. If a column exceeds its limit, the header turns amber as a gentle nudge to finish things before starting new ones.

### Task details

Click any task to see its full details and edit it. Tasks can have:

- **A name and description** — what it is and any notes about it
- **A priority** — high, medium, or low (color-coded red, yellow, green)
- **A category** — organize however makes sense to you (work, personal, health, etc.)
- **A due date** — the dashboard warns you about overdue and upcoming tasks
- **Subtasks** — break big tasks into smaller steps and check them off
- **Notes** — add comments and updates as you go
- **Time tracking** — start/stop a timer to track how long things take
- **Recurring schedule** — daily, weekly, or monthly repetition

### Filtering and search

Above the task list there are filters for status, category, and priority, plus a search box. You can also sort by name, date, priority, or due date. These work in both the list view and the Kanban view.

### Bulk operations

Select multiple tasks with checkboxes, then complete, delete, or change their category/priority in one go. Useful for inbox-zero style processing.

### Analytics

Click the chart icon to open the analytics panel. It shows:

- **Task flow** — how tasks move forward (backlog to pending to completed) vs. backward (regressions) over the last 30 days
- **Cumulative flow diagram** — a stacked area chart showing how many tasks are in each status over time, so you can see if work is piling up somewhere
- **Cycle time** — how long tasks typically spend in each status before moving on
- **Completion trend** — a 30-day sparkline of how many tasks you're finishing

### AI insights

If you have a Google Gemini API key, the dashboard can send your task data to Gemini 2.5 Flash and get back a productivity analysis. It covers things like your health score, task aging, time allocation, priority balance, and specific recommendations.

To set it up, click the gear icon, paste your Gemini API key, and save. The key is encrypted and stored locally — it never leaves your machine except to call the Gemini API.

You can also get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).

### Keyboard shortcuts

Press `?` to see the full list. The highlights:

- `N` — new task
- `K` — toggle Kanban view
- `/` — focus search
- `A` — open analytics
- `E` — export tasks

### Export and import

Export all your tasks as JSON for backup or migration. Import them back in later. The export includes everything — subtasks, notes, time tracking data, all of it.

## The CLI

There's also a command-line task manager that works with the same database:

```bash
node task-manager.js add "Buy groceries" --priority high --category personal
node task-manager.js list
node task-manager.js done 5
```

And a standalone insights script that runs the AI analysis from your terminal:

```bash
GEMINI_API_KEY=your-key node task-insights.js
```

Both read from the same SQLite database, so changes show up everywhere instantly.

## Demo data

Want to see the dashboard with realistic data before adding your own tasks? There's a seeder script that populates 27 tasks across all statuses, categories, and priorities — with subtasks, due dates, time tracking, and notes:

```bash
# Make sure the server is running first
node seed-demo.js
```

Refresh the dashboard and you'll see a fully populated board. You can delete the demo tasks anytime.

## How it's built

Intentionally simple:

- **Backend** — Node.js with Express. One file (`server.js`), about 1400 lines. REST API for everything.
- **Database** — SQLite. One file (`tasks.db`). No database server to install or manage.
- **Frontend** — Plain HTML, CSS, and JavaScript. No React, no Vue, no build step. Two files (`index.html` and `app.js`).
- **Styling** — Hand-written CSS with a dark theme. No Tailwind, no Bootstrap.

The whole thing is about 8,000 lines of code across a handful of files. You can read and understand all of it.

## File overview

| File | What it does |
|------|-------------|
| `server.js` | Express server with all API endpoints |
| `public/index.html` | The entire UI — HTML and CSS |
| `public/app.js` | All frontend logic — API calls, rendering, interactions |
| `tasks-init.js` | Database schema (for reference) |
| `task-manager.js` | Command-line task manager |
| `task-insights.js` | CLI script for AI-powered task analysis |
| `seed-demo.js` | Populates 27 demo tasks for testing |
| `migrate-add-backlog.js` | One-time migration to add backlog status |
| `start-dashboard.sh` | Quick-start helper script |

## Troubleshooting

**Port already in use**
```bash
# See what's using port 3000
lsof -i :3000
# Or just use a different port
PORT=3001 node server.js
```

**Tasks not showing up** — Try a hard refresh (Ctrl+Shift+R). Check the browser console (F12) for errors. Make sure the server is still running.

**Database locked** — This can happen if two processes try to write at the same time. Stop the server, make sure no other process is using the database, and start it again.

**AI insights not working** — Make sure you've added a Gemini API key in Settings. You can test it with the "Test Key" button. The free tier of Google AI Studio works fine for this.

## License

Do whatever you want with it. It's yours.
