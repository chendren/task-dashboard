#!/usr/bin/env node
/**
 * Task Dashboard — AI Insights (Standalone CLI)
 *
 * Reads all task data from the SQLite database (tasks, subtasks, notes, time logs,
 * status transitions) and sends it to Google Gemini 2.5 Flash for productivity analysis.
 * Outputs a structured report covering health score, task aging, time allocation,
 * priority balance, and actionable recommendations.
 *
 * The API key can come from three places (checked in order):
 *   1. GEMINI_API_KEY environment variable
 *   2. Encrypted key saved in the dashboard's settings table
 *   3. OpenClaw config at ~/.openclaw/openclaw.json → env.GEMINI_API_KEY
 *
 * Usage:
 *   GEMINI_API_KEY=your-key node task-insights.js
 *   node task-insights.js   (uses saved or OpenClaw key)
 *
 * The same analysis is available in the web dashboard via the AI Insights button.
 * This script is for running it from the terminal or piping the output elsewhere.
 *
 * Part of the Task Dashboard project — see README.md for full documentation.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const dbPath = path.join(process.env.HOME, '.openclaw/workspace/tasks.db');
const userId = 'REDACTED_TELEGRAM_USER_ID';

// Encryption helpers (must match server.js)
const ENCRYPTION_KEY = crypto.scryptSync(
  `task-dashboard-${require('os').hostname()}-${dbPath}`,
  'task-dashboard-salt-v1',
  32
);

function decrypt(encryptedText) {
  const [ivHex, tagHex, data] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// DB helpers
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds === 0) return '0s';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function gatherInsightsData(db) {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];

  // All tasks with subtask counts
  const tasks = await dbAll(db, `
    SELECT t.*,
      (SELECT COUNT(*) FROM subtasks WHERE taskId = t.id) as subtaskTotal,
      (SELECT COUNT(*) FROM subtasks WHERE taskId = t.id AND completed = 1) as subtaskDone
    FROM tasks t ORDER BY t.createdAt DESC
  `);

  // Counts
  const total = tasks.length;
  const backlog = tasks.filter(t => t.status === 'backlog').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const archived = tasks.filter(t => t.status === 'archived').length;

  // Overdue analysis
  const overdue = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'completed' && t.status !== 'archived');
  const dueToday = tasks.filter(t => t.dueDate && t.dueDate === today && t.status !== 'completed');
  const dueTomorrow = tasks.filter(t => {
    if (!t.dueDate || t.status === 'completed') return false;
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    return t.dueDate === tom.toISOString().split('T')[0];
  });

  // Task aging (pending + backlog tasks)
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'backlog');
  const agingBuckets = { over30days: [], over14days: [], over7days: [], recent: [] };
  pendingTasks.forEach(t => {
    const ageMs = Date.now() - new Date(t.createdAt).getTime();
    const ageDays = Math.floor(ageMs / 86400000);
    if (ageDays > 30) agingBuckets.over30days.push({ ...t, ageDays });
    else if (ageDays > 14) agingBuckets.over14days.push({ ...t, ageDays });
    else if (ageDays > 7) agingBuckets.over7days.push({ ...t, ageDays });
    else agingBuckets.recent.push({ ...t, ageDays });
  });

  // Time by category
  const timeByCategory = await dbAll(db, `
    SELECT category, SUM(timeSpent) as totalTime, COUNT(*) as taskCount
    FROM tasks GROUP BY category ORDER BY totalTime DESC
  `);

  // Completion stats
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const avgTime = await dbGet(db, `SELECT AVG(timeSpent) as avg FROM tasks WHERE status = 'completed' AND timeSpent > 0`);
  const totalTimeTracked = await dbGet(db, `SELECT SUM(timeSpent) as total FROM tasks`);

  // Completions last 30 days
  const completions30d = await dbAll(db, `
    SELECT DATE(completedAt) as date, COUNT(*) as count
    FROM tasks WHERE completedAt IS NOT NULL AND completedAt >= DATE('now', '-30 days')
    GROUP BY DATE(completedAt) ORDER BY date
  `);

  // Priority breakdown (active = backlog + pending)
  const activeTasks = tasks.filter(t => t.status === 'pending' || t.status === 'backlog');
  const priorityBreakdown = {
    high: activeTasks.filter(t => t.priority === 'high').length,
    medium: activeTasks.filter(t => t.priority === 'medium').length,
    low: activeTasks.filter(t => t.priority === 'low').length
  };

  // Flow transitions
  let flowTransitions = [];
  try {
    flowTransitions = await dbAll(db, `
      SELECT fromStatus, toStatus, COUNT(*) as count
      FROM status_transitions
      WHERE createdAt >= DATE('now', '-30 days')
      GROUP BY fromStatus, toStatus
    `);
  } catch (e) { /* table may not exist yet */ }

  // Recurring tasks
  const recurringTasks = await dbAll(db, `
    SELECT r.*, t.name, t.status FROM recurring r JOIN tasks t ON t.id = r.taskId
  `);

  // Recent activity (last 50 events)
  const recentActivity = await dbAll(db, `
    SELECT n.*, t.name as taskName FROM notes n
    JOIN tasks t ON t.id = n.taskId
    ORDER BY n.createdAt DESC LIMIT 50
  `);

  // Categories
  const categories = await dbAll(db, 'SELECT * FROM categories ORDER BY name');

  return {
    timestamp: now,
    summary: { total, backlog, pending, completed, archived, completionRate },
    overdue: overdue.map(t => ({ id: t.id, name: t.name, dueDate: t.dueDate, priority: t.priority, category: t.category })),
    dueToday: dueToday.map(t => ({ id: t.id, name: t.name, priority: t.priority })),
    dueTomorrow: dueTomorrow.map(t => ({ id: t.id, name: t.name, priority: t.priority })),
    aging: {
      over30days: agingBuckets.over30days.map(t => ({ id: t.id, name: t.name, ageDays: t.ageDays, priority: t.priority, category: t.category })),
      over14days: agingBuckets.over14days.map(t => ({ id: t.id, name: t.name, ageDays: t.ageDays, priority: t.priority })),
      over7days: agingBuckets.over7days.map(t => ({ id: t.id, name: t.name, ageDays: t.ageDays })),
      recentCount: agingBuckets.recent.length
    },
    timeByCategory: timeByCategory.map(t => ({ category: t.category, totalTime: formatDuration(t.totalTime), taskCount: t.taskCount })),
    avgCompletionTime: formatDuration(Math.round(avgTime.avg || 0)),
    totalTimeTracked: formatDuration(totalTimeTracked.total || 0),
    completions30d,
    priorityBreakdown,
    recurringTasks: recurringTasks.map(r => ({ name: r.name, pattern: r.pattern, nextOccurrence: r.nextOccurrence, status: r.status })),
    flowTransitions: flowTransitions.map(t => ({ from: t.fromStatus, to: t.toStatus, count: t.count })),
    recentActivity: recentActivity.slice(0, 20).map(a => ({ task: a.taskName, content: a.content, type: a.type, time: a.createdAt })),
    categories: categories.map(c => c.name),
    allTasks: tasks.map(t => ({
      id: t.id, name: t.name, status: t.status, priority: t.priority, category: t.category,
      dueDate: t.dueDate, createdAt: t.createdAt, completedAt: t.completedAt,
      timeSpent: formatDuration(t.timeSpent), subtasks: t.subtaskTotal > 0 ? `${t.subtaskDone}/${t.subtaskTotal}` : null,
      recurring: t.recurring
    }))
  };
}

const SYSTEM_PROMPT = `You are a productivity analyst reviewing a personal task management system. You have access to the complete data snapshot of someone's task dashboard.

Analyze the data thoroughly and provide a concise but insightful report covering:

1. **Health Score** (1-10) - Overall system health with brief justification
2. **Key Metrics** - Quick summary of numbers that matter
3. **Task Aging Analysis** - Stale tasks, bottlenecks, things sitting too long
4. **Time Allocation** - Where time is being spent vs. where it should be
5. **Priority & Category Balance** - Are high-priority items getting attention? Category spread?
6. **Kanban Flow** - How tasks move through statuses, any pileups?
7. **Actionable Recommendations** - 5-7 specific, practical suggestions
8. **Motivation** - One encouraging observation about their productivity

Keep it concise and direct. Use simple formatting with headers and bullet points. Be specific — reference actual task names, categories, and numbers from the data. Don't be generic.`;

async function getApiKey(db) {
  // Check env first
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // Check stored settings
  try {
    const row = await dbGet(db, 'SELECT value FROM settings WHERE key = ?', ['gemini_api_key']);
    if (row) return decrypt(row.value);
  } catch (e) { /* settings table may not exist yet */ }
  return null;
}

async function callGeminiAPI(data, apiKey) {
  if (!apiKey) {
    throw new Error('No API key found. Set GEMINI_API_KEY env var or save a key in dashboard Settings.');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        parts: [{ text: `Here is the complete task system data snapshot as of ${data.timestamp}:\n\n${JSON.stringify(data, null, 2)}\n\nPlease analyze this data and provide your insights report.` }]
      }],
      generationConfig: { maxOutputTokens: 2000 }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${err}`);
  }

  const result = await response.json();
  return result.candidates[0].content.parts[0].text;
}

function sendTelegram(message) {
  try {
    // Truncate for Telegram's 4096 char limit
    const truncated = message.length > 4000 ? message.substring(0, 3997) + '...' : message;
    const escaped = truncated.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const cmd = `openclaw message send --channel telegram --target ${userId} --message "${escaped}"`;
    execSync(cmd, { stdio: 'pipe', timeout: 15000 });
    console.log('\n✅ Insights sent to Telegram');
  } catch (err) {
    console.error('\n⚠️  Could not send to Telegram:', err.message);
  }
}

async function main() {
  console.log('🔍 Gathering task data...');

  const db = new sqlite3.Database(dbPath);

  try {
    const data = await gatherInsightsData(db);
    console.log(`📊 Found ${data.summary.total} tasks (${data.summary.backlog || 0} backlog, ${data.summary.pending} pending, ${data.summary.completed} completed)`);
    console.log(`⏰ ${data.overdue.length} overdue, ${data.dueToday.length} due today\n`);

    const apiKey = await getApiKey(db);
    console.log('🤖 Analyzing with Gemini 2.5 Flash...\n');
    const insights = await callGeminiAPI(data, apiKey);

    console.log('═'.repeat(60));
    console.log('  TASK SYSTEM INSIGHTS');
    console.log('═'.repeat(60));
    console.log();
    console.log(insights);
    console.log();
    console.log('═'.repeat(60));

    // Send to Telegram
    sendTelegram(`📊 Task Insights Report\n\n${insights}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
