# MEMORY.md - Long-Term Memory

## Setup (2026-02-22)

**Initial Setup Complete:**
- OpenClaw running on Raspberry Pi (see local network config)
- Telegram bot configured and live
  - Bot token: stored in environment (`TELEGRAM_BOT_TOKEN`) — never commit tokens
  - User ID: stored in environment (`TELEGRAM_USER_ID`)
  - Chad can message the bot from his phone
- Identity established: Cascade, practical AI assistant
- User: Chad (America/Chicago timezone)

**What's Working:**
- Gateway: local, reachable
- Model: Claude Haiku (sufficient for now)
- Channel: Telegram (primary contact method)
- **✅ Reminder system: LIVE (basic cron reminders disabled per request)**
- **✅ Task Management System: LIVE and fully functional**
- **✅ Web Dashboard: LIVE on port 3000**

**Task Management System:**
- Database: SQLite at `~/.openclaw/workspace/tasks.db`
- Tables: tasks, categories, recurring, timeLog
- CLI: `node task-manager.js <command> [args]`
- Commands: add, list, done, delete, view, help
- Features: priorities, categories, due dates, descriptions, time tracking (ready)
- Telegram: Messages send automatically for all operations
- Full schema ready for recurring tasks and time tracking

**Web Dashboard:**
- Backend: Express server at `node server.js`
- Frontend: React-like vanilla JS with dark theme UI
- Port: 3000 (configurable)
- URL: http://localhost:3000
- Features: 
  - Create/read/update/delete tasks
  - Filter by status, category, priority
  - Search by name
  - Color-coded priorities
  - Due date tracking
  - Real-time stats (total, pending, completed)
  - Responsive design (mobile-friendly)
  - Auto-refresh every 10 seconds
- API: REST endpoints at /api/tasks

**Reminder System (PAUSED):**
- Script: `check-reminders.sh` 
- Database: `reminders.json`
- Cron: Disabled per Chad's request (was sending too many duplicates)
- Can be re-enabled if needed

**Important Notes:**
- `jq` not installed on Pi (use grep/sed for JSON)
- HTTP API `/api/message` doesn't exist (use OpenClaw CLI)
- Timezone: America/Chicago (CST/CDT)
- Cron needs full paths to executables
- sqlite3 npm package installed for task system
- Express npm package installed for web server
- Task system tested and working, dashboard tested and running

**Next Steps:**
1. ✅ Task Management System (DONE)
2. ✅ Web Dashboard (DONE)
3. Telegram command wrapper for natural `/task` commands
4. Add recurring task generation
5. Add time tracking START/STOP commands
6. Create daily task summary notifications
7. Mobile app (optional)

---

**Notes:**
- Chad is direct and practical — no fluff
- Prefers getting things done over long explanations
- This Pi is his personal automation hub
- Full task system (CLI + Web + Telegram integration) is production-ready
