# Task Dashboard

A personal task management app that looks and feels like Trello — but runs entirely on your machine. No accounts, no cloud, no subscriptions. Just a clean board for keeping track of what you need to do.

Built with Node.js, SQLite, and plain JavaScript. Nothing fancy to install, nothing that phones home. Your data stays on your computer in a single SQLite file.

## What it looks like

A dark-themed Trello-style board that fills your screen. Four columns, compact cards, click-to-open detail view — all running from a single `node server.js` command.

The board has four columns:

- **Backlog** — ideas and things you're not ready to commit to yet
- **Pending** — what you're actively working on
- **Completed** — things you've finished
- **Archived** — done and out of sight

Click "+ Add a card" at the bottom of any column to create a task right where you want it. Click a card to open its detail view. Drag cards between columns to change their status. That's the core of it.

## Why this exists

Most task apps want you to create an account, pay for features, or live inside someone else's ecosystem. This one is different. It's a single-page app backed by a SQLite file on your own machine. You own everything.

It started as a simple to-do list and grew into something genuinely useful:

- Break tasks into subtasks and track progress on each one
- Set due dates and get visual warnings when things are overdue
- Track how long you spend on tasks with a built-in timer
- Set up recurring tasks (daily, weekly, monthly) so routine things re-appear automatically
- Organize by categories and priorities with color-coded labels
- Add notes to tasks as you work through them
- View analytics that show how your tasks flow through the board over time
- Ask an AI to analyze your task data and give you a productivity report

None of these features require an internet connection except the AI insights (which calls the Google Gemini API).

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

Find your machine's IP address (`hostname -I` on Linux, or check your network settings), then visit `http://your-ip:3000` from any device on the same network. Works well on tablets and phones too — the layout is fully responsive with horizontal-scrolling columns on smaller screens.

## Features in more detail

### The board

The main view is a Trello-style board with four columns. Each column is 272px wide (same as Trello), with a scrollable card area and a footer for adding new cards.

Cards are compact: colored label bars at the top show category and priority at a glance, followed by the task title and small badge icons for due dates, subtask counts, descriptions, timers, and recurring schedules. Hover over a card to see a pencil icon for quick access.

You can set WIP (work-in-progress) limits on columns. If a column exceeds its limit, the header turns amber as a gentle nudge to finish things before starting new ones.

Everything is drag-and-drop. Grab a card and move it between columns to change its status — backlog to pending, pending to completed, wherever it needs to go. The transition is recorded for analytics.

### Card detail view

Click any card to open a Trello-style detail modal. It's a two-column layout:

**Left side (main content):**
- Editable title and description (click to type, auto-saves when you click away)
- Subtask checklist — add items, check them off, delete them
- Activity feed — add notes, see when things happened

**Right side (action sidebar):**
- Category picker
- Priority selector (high, medium, low)
- Due date input
- Recurring schedule (daily, weekly, monthly)
- Move to column (change status)
- Start/stop timer
- Delete card

Changes save immediately — no "Save" button to forget to click.

### Inline add card

Click "+ Add a card" at the bottom of any column. A textarea appears right there. Type a name, press Enter, and the card is created in that column. Press Escape to cancel. No modals, no extra clicks.

### Board header and menu

The top bar is compact (48px) and packs everything you need:
- Board title and inline stats (total cards, active, done)
- Search box, status/category/priority filters
- A "..." menu button that opens a dropdown with: Analytics, AI Insights, Categories, Export, Import, Settings, Shortcuts, and a toggle to switch to list view

### Filtering and search

The compact filters in the board header let you narrow down what you see by status, category, and priority. The search box filters by task name. These work in both board view and list view.

### Bulk operations

Switch to list view (via the board menu) to access bulk operations. Select multiple tasks with checkboxes, then complete, delete, or change their category/priority in one go. Useful for inbox-zero style processing.

### Analytics

Open from the board menu. It shows:

- **Task flow** — how tasks move forward (backlog → pending → completed) vs. backward (regressions) over the last 30 days
- **Cumulative flow diagram** — a stacked area chart showing how many tasks are in each status over time, so you can see if work is piling up somewhere
- **Cycle time** — how long tasks typically spend in each status before moving on
- **Completion trend** — a 30-day sparkline of how many tasks you're finishing

### AI insights

If you have a Google Gemini API key, the dashboard can send your task data to Gemini 2.5 Flash and get back a productivity analysis. It covers things like your health score, task aging, time allocation, priority balance, and specific recommendations.

To set it up, click "..." → Settings, paste your Gemini API key, and save. The key is encrypted and stored locally — it never leaves your machine except when calling the Gemini API.

You can get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).

### Keyboard shortcuts

Press `?` to see the full list. The highlights:

- `N` — add a card to the Pending column
- `/` — focus search
- `A` — open analytics
- `E` — export tasks
- `Esc` — close the current modal or card detail

### Export and import

Export all your tasks as JSON for backup or migration. Import them back in later. The export includes everything — subtasks, notes, time tracking data, status transitions, all of it.

## The CLI

There's also a command-line task manager that works with the same database:

```bash
node task-manager.js add "Buy groceries" "2026-03-01" "high" "personal"
node task-manager.js list
node task-manager.js done 5
node task-manager.js view 1
```

And a standalone insights script that runs the AI analysis from your terminal:

```bash
GEMINI_API_KEY=your-key node task-insights.js
```

Both read from the same SQLite database, so changes show up everywhere instantly — add a task from the CLI and it appears on the board within 10 seconds (or immediately on refresh).

## Demo data

Want to see the board fully populated before adding your own tasks? There's a seeder script that creates 27 realistic tasks across all columns, categories, and priorities — with subtasks, due dates, time tracking, and notes:

```bash
# Make sure the server is running first
node seed-demo.js
```

Refresh the board and you'll see a fully populated Trello-style layout. Delete the demo tasks anytime — they're not special.

## How it's built

Intentionally simple. No build step, no framework, no transpilation.

- **Backend** — Node.js with Express. One file (`server.js`), ~1400 lines. Full REST API for tasks, subtasks, notes, categories, time tracking, analytics, settings, and AI insights.
- **Database** — SQLite via `sqlite3`. One file (`tasks.db`). Tables for tasks, subtasks, notes, categories, time logs, status transitions, recurring patterns, WIP limits, and encrypted settings.
- **Frontend** — Plain HTML, CSS, and JavaScript. Two files (`index.html` for layout/styling, `app.js` for all behavior). No React, no Vue, no build step.
- **Styling** — Hand-written CSS with a dark Trello-inspired theme. Full viewport layout, 272px columns, compact cards, responsive down to mobile.

The whole thing is about 5,000 lines of code across a handful of files. You can read and understand all of it in an afternoon.

## File overview

| File | What it does |
|------|-------------|
| `server.js` | Express REST API — all endpoints, database setup, Gemini proxy, encryption |
| `public/index.html` | Trello-style layout and CSS — board, columns, cards, modals, responsive design |
| `public/app.js` | All frontend logic — board rendering, card detail, inline add, drag-drop, filters |
| `task-manager.js` | CLI for managing tasks from the terminal (same database) |
| `task-insights.js` | Standalone AI analysis script using Gemini API |
| `tasks-init.js` | Database schema reference — all table definitions |
| `seed-demo.js` | Creates 27 demo tasks to showcase the full board |
| `migrate-add-backlog.js` | One-time migration: adds backlog status and status transitions table |
| `start-dashboard.sh` | Quick-start helper script |
| `check-reminders.sh` | Cron-based reminder checker (sends via Telegram) |
| `send-reminders.sh` | Reminder sender with due-time matching |
| `reminder-daemon.sh` | Long-running reminder loop (alternative to cron) |

## Running on a Raspberry Pi

This project was originally built to run on a Raspberry Pi as part of a personal automation setup. It works great on modest hardware — SQLite is lightweight, Express is minimal, and the frontend is just static files.

If you're running it on a Pi or any always-on machine:

```bash
# Start in the background
nohup node server.js > dashboard.log 2>&1 &

# Access from your phone/tablet/laptop
# Find the Pi's IP: hostname -I
# Then visit: http://<pi-ip>:3000
```

The board is fully responsive, so it works well on phones and tablets when you access it over your local network.

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

**AI insights not working** — Make sure you've added a Gemini API key in Settings (board menu → "..."). You can test it with the "Test Key" button. The free tier of Google AI Studio works fine for this.

**Drag and drop not working** — Make sure you're dragging the card itself, not clicking a button on it. Cards need to be grabbed by their body area.

## License

Do whatever you want with it. It's yours.
