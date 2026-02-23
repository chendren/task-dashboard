#!/usr/bin/env node
/**
 * Task Dashboard — Backend Server
 *
 * Express REST API + static file server for a Trello-style task management board.
 * Stores everything in a local SQLite database — no cloud, no accounts, no subscriptions.
 *
 * What this file does:
 *   - Serves the Trello-style frontend (public/index.html + public/app.js)
 *   - Provides full CRUD endpoints for tasks, subtasks, notes, categories
 *   - Tracks time spent on tasks (start/stop timer)
 *   - Handles recurring task generation (daily, weekly, monthly)
 *   - Records status transitions for flow analytics and cycle time charts
 *   - Manages WIP (work-in-progress) limits per column
 *   - Stores encrypted API keys for Gemini AI integration
 *   - Proxies AI insight requests to the Google Gemini API
 *   - Supports import/export of all task data as JSON
 *
 * Run:    node server.js
 * Custom: PORT=8080 node server.js
 * Visit:  http://localhost:3000
 *
 * The same SQLite database is shared with the CLI (task-manager.js) and the
 * standalone insights script (task-insights.js), so changes sync instantly.
 *
 * Part of the Task Dashboard project — see README.md for full documentation.
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(process.env.HOME, '.openclaw/workspace/tasks.db');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database error:', err);
    process.exit(1);
  }
  console.log('✓ Database connected');
  db.run('PRAGMA foreign_keys = ON');
});

// Helper: Promise wrapper for db operations
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Helper: Log an event to the notes table
async function logEvent(taskId, message) {
  try {
    await dbRun(
      'INSERT INTO notes (taskId, content, type) VALUES (?, ?, ?)',
      [taskId, message, 'event']
    );
  } catch (err) {
    console.error('Error logging event:', err.message);
  }
}

// Helper: Format seconds for event messages
function formatDurationServer(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Helper: CSV escape
function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ==================== ENCRYPTION HELPERS ====================

// Derive a machine-specific encryption key from hostname + db path
const ENCRYPTION_KEY = crypto.scryptSync(
  `task-dashboard-${require('os').hostname()}-${dbPath}`,
  'task-dashboard-salt-v1',
  32
);

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

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

async function getSetting(key) {
  const row = await dbGet('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return null;
  try { return decrypt(row.value); } catch { return null; }
}

async function setSetting(key, value) {
  const encrypted = encrypt(value);
  await dbRun(
    'INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = CURRENT_TIMESTAMP',
    [key, encrypted, encrypted]
  );
}

async function deleteSetting(key) {
  await dbRun('DELETE FROM settings WHERE key = ?', [key]);
}

// Helper: get API key from settings or env
async function getApiKey() {
  return process.env.GEMINI_API_KEY || await getSetting('gemini_api_key');
}

// Ensure settings table exists
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Ensure status_transitions table exists
db.run(`
  CREATE TABLE IF NOT EXISTS status_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL,
    fromStatus TEXT NOT NULL,
    toStatus TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
  )
`);

// ==================== SETTINGS API ====================

app.get('/api/settings', async (req, res) => {
  try {
    const apiKey = await getSetting('gemini_api_key');
    const hasEnvKey = !!process.env.GEMINI_API_KEY;
    res.json({
      gemini_api_key: apiKey ? { configured: true, masked: '...' + apiKey.slice(-4) } : { configured: false },
      env_key_present: hasEnvKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { gemini_api_key } = req.body;
    if (gemini_api_key !== undefined) {
      if (gemini_api_key === '' || gemini_api_key === null) {
        await deleteSetting('gemini_api_key');
        return res.json({ message: 'API key removed' });
      }
      await setSetting('gemini_api_key', gemini_api_key);
      insightsCache = { data: null, generatedAt: null };
      return res.json({ message: 'API key saved and encrypted', masked: '...' + gemini_api_key.slice(-4) });
    }
    res.status(400).json({ error: 'No settings provided' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/test-key', async (req, res) => {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'No API key configured' });
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "ok"' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });
    if (response.ok) {
      res.json({ valid: true, message: 'API key is valid' });
    } else {
      const err = await response.text();
      res.json({ valid: false, message: `API key test failed (${response.status})` });
    }
  } catch (err) {
    res.json({ valid: false, message: err.message });
  }
});

// ==================== CATEGORIES API ====================

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await dbAll('SELECT * FROM categories ORDER BY name');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name required' });

    const result = await dbRun(
      'INSERT INTO categories (name, color) VALUES (?, ?)',
      [name.toLowerCase().trim(), color || '#64748b']
    );
    const category = await dbGet('SELECT * FROM categories WHERE id = ?', [result.lastID]);
    res.status(201).json(category);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Category already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name.toLowerCase().trim()); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await dbRun(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, values);
    const category = await dbGet('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const cat = await dbGet('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    await dbRun('UPDATE tasks SET category = ? WHERE category = ?', ['general', cat.name]);
    await dbRun('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ message: 'Category deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== DUE DATE SUMMARY (must be before /api/tasks/:id) ====================

app.get('/api/due-summary', async (req, res) => {
  try {
    const overdue = await dbAll(`
      SELECT * FROM tasks
      WHERE dueDate < DATE('now') AND status != 'completed' AND status != 'archived'
      ORDER BY dueDate ASC
    `);
    const dueToday = await dbAll(`
      SELECT * FROM tasks
      WHERE dueDate = DATE('now') AND status != 'completed' AND status != 'archived'
      ORDER BY priority DESC
    `);
    const dueTomorrow = await dbAll(`
      SELECT * FROM tasks
      WHERE dueDate = DATE('now', '+1 day') AND status != 'completed' AND status != 'archived'
      ORDER BY priority DESC
    `);
    res.json({
      overdue: { count: overdue.length, tasks: overdue },
      dueToday: { count: dueToday.length, tasks: dueToday },
      dueTomorrow: { count: dueTomorrow.length, tasks: dueTomorrow }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ANALYTICS API ====================

app.get('/api/analytics/time-by-category', async (req, res) => {
  try {
    const data = await dbAll(`
      SELECT t.category, SUM(t.timeSpent) as totalTime, COUNT(*) as taskCount
      FROM tasks t
      GROUP BY t.category
      ORDER BY totalTime DESC
    `);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/completions', async (req, res) => {
  try {
    const data = await dbAll(`
      SELECT DATE(completedAt) as date, COUNT(*) as count
      FROM tasks
      WHERE completedAt IS NOT NULL AND completedAt >= DATE('now', '-30 days')
      GROUP BY DATE(completedAt)
      ORDER BY date
    `);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/summary', async (req, res) => {
  try {
    const overdue = await dbGet(`SELECT COUNT(*) as count FROM tasks WHERE dueDate < DATE('now') AND status != 'completed' AND status != 'archived'`);
    const avgTime = await dbGet(`SELECT AVG(timeSpent) as avg FROM tasks WHERE status = 'completed' AND timeSpent > 0`);
    const completionRate = await dbGet(`SELECT
      ROUND(100.0 * SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as rate
      FROM tasks`);
    const totalTimeTracked = await dbGet(`SELECT SUM(timeSpent) as total FROM tasks`);
    res.json({
      overdue: overdue.count,
      avgCompletionTime: Math.round(avgTime.avg || 0),
      completionRate: completionRate.rate || 0,
      totalTimeTracked: totalTimeTracked.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== EXPORT/IMPORT API ====================

app.get('/api/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const tasks = await dbAll('SELECT * FROM tasks');

    if (format === 'csv') {
      // Enrich with subtask names for CSV
      for (const task of tasks) {
        const subtasks = await dbAll('SELECT name FROM subtasks WHERE taskId = ?', [task.id]);
        task.subtaskNames = subtasks.map(s => s.name).join('; ');
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=tasks-export.csv');
      const header = 'id,name,description,category,priority,dueDate,status,recurring,timeSpent,createdAt,completedAt,subtasks\n';
      const rows = tasks.map(t =>
        [t.id, csvEscape(t.name), csvEscape(t.description || ''), t.category, t.priority,
         t.dueDate || '', t.status, t.recurring || '', t.timeSpent, t.createdAt, t.completedAt || '',
         csvEscape(t.subtaskNames)
        ].join(',')
      ).join('\n');
      res.send(header + rows);
    } else {
      // Full JSON export with all related data
      for (const task of tasks) {
        task.subtasks = await dbAll('SELECT * FROM subtasks WHERE taskId = ?', [task.id]);
        task.timeLogs = await dbAll('SELECT * FROM timeLog WHERE taskId = ?', [task.id]);
        task.recurringRule = await dbGet('SELECT * FROM recurring WHERE taskId = ?', [task.id]);
        task.notes = await dbAll('SELECT * FROM notes WHERE taskId = ?', [task.id]);
      }
      const categories = await dbAll('SELECT * FROM categories');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=tasks-export.json');
      res.json({ exportDate: new Date().toISOString(), tasks, categories });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import', async (req, res) => {
  try {
    const { tasks: importTasks, categories: importCats } = req.body;
    let imported = 0;

    if (importCats) {
      for (const cat of importCats) {
        try {
          await dbRun('INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)', [cat.name, cat.color]);
        } catch (e) { /* ignore duplicates */ }
      }
    }

    if (importTasks) {
      for (const task of importTasks) {
        const result = await dbRun(
          'INSERT INTO tasks (name, description, category, priority, dueDate, status, recurring, timeSpent) VALUES (?,?,?,?,?,?,?,?)',
          [task.name, task.description, task.category || 'general', task.priority || 'medium',
           task.dueDate, task.status || 'pending', task.recurring, task.timeSpent || 0]
        );
        const newId = result.lastID;

        if (task.subtasks) {
          for (const st of task.subtasks) {
            await dbRun('INSERT INTO subtasks (taskId, name, completed, sortOrder) VALUES (?,?,?,?)',
              [newId, st.name, st.completed || 0, st.sortOrder || 0]);
          }
        }

        if (task.recurringRule) {
          await dbRun('INSERT INTO recurring (taskId, pattern, nextOccurrence) VALUES (?,?,?)',
            [newId, task.recurringRule.pattern, task.recurringRule.nextOccurrence]);
        }

        if (task.notes) {
          for (const note of task.notes) {
            await dbRun('INSERT INTO notes (taskId, content, type, createdAt) VALUES (?,?,?,?)',
              [newId, note.content, note.type || 'note', note.createdAt]);
          }
        }

        imported++;
      }
    }

    res.json({ message: `Imported ${imported} tasks`, count: imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TASKS API ====================

// GET all tasks with optional filters, sorting, and subtask counts
app.get('/api/tasks', async (req, res) => {
  try {
    const { status, category, priority, search, sort, order } = req.query;
    let query = `SELECT t.*,
      (SELECT COUNT(*) FROM subtasks WHERE taskId = t.id) as subtaskTotal,
      (SELECT COUNT(*) FROM subtasks WHERE taskId = t.id AND completed = 1) as subtaskDone
      FROM tasks t WHERE 1=1`;
    const params = [];

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (category) {
      query += ' AND t.category = ?';
      params.push(category);
    }
    if (priority) {
      query += ' AND t.priority = ?';
      params.push(priority);
    }
    if (search) {
      query += ' AND (t.name LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Sorting
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    switch (sort) {
      case 'name':
        query += ` ORDER BY t.name COLLATE NOCASE ${sortDir}`;
        break;
      case 'dueDate':
        query += ` ORDER BY CASE WHEN t.dueDate IS NULL THEN 1 ELSE 0 END, t.dueDate ${sortDir}`;
        break;
      case 'created':
        query += ` ORDER BY t.createdAt ${sortDir}`;
        break;
      case 'priority':
      default:
        if (sort === 'priority') {
          query += ` ORDER BY CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END ${sortDir}`;
        } else {
          query += ' ORDER BY CASE t.priority WHEN \'high\' THEN 3 WHEN \'medium\' THEN 2 WHEN \'low\' THEN 1 END DESC, t.dueDate ASC';
        }
        break;
    }

    const tasks = await dbAll(query, params);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single task
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create task
app.post('/api/tasks', async (req, res) => {
  try {
    let { name, description, category = 'general', priority = 'medium', dueDate, status = 'pending' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Task name required' });
    }

    if (!['low', 'medium', 'high'].includes(priority)) {
      priority = 'medium';
    }

    if (!['backlog', 'pending', 'completed', 'archived'].includes(status)) {
      status = 'pending';
    }

    const result = await dbRun(
      'INSERT INTO tasks (name, description, category, priority, dueDate, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || null, category, priority, dueDate || null, status]
    );

    await logEvent(result.lastID, 'Task created');

    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    let { name, description, category, priority, dueDate, status } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (category !== undefined) { updates.push('category = ?'); values.push(category); }
    if (priority !== undefined && ['low', 'medium', 'high'].includes(priority)) {
      updates.push('priority = ?'); values.push(priority);
    }
    if (dueDate !== undefined) { updates.push('dueDate = ?'); values.push(dueDate); }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
      if (status === 'completed') {
        updates.push('completedAt = CURRENT_TIMESTAMP');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Track transitions BEFORE the update
    if (status !== undefined) {
      const beforeTask = await dbGet('SELECT status FROM tasks WHERE id = ?', [req.params.id]);
      if (beforeTask && beforeTask.status !== status) {
        await dbRun(
          'INSERT INTO status_transitions (taskId, fromStatus, toStatus) VALUES (?, ?, ?)',
          [req.params.id, beforeTask.status, status]
        );
      }
    }

    values.push(req.params.id);
    await dbRun(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

    // Log status changes
    if (status !== undefined) {
      await logEvent(req.params.id, `Status changed to ${status}`);
    }

    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE task (cascade handles subtasks, timeLog, recurring, notes, transitions)
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await dbRun('DELETE FROM subtasks WHERE taskId = ?', [req.params.id]);
    await dbRun('DELETE FROM timeLog WHERE taskId = ?', [req.params.id]);
    await dbRun('DELETE FROM recurring WHERE taskId = ?', [req.params.id]);
    await dbRun('DELETE FROM notes WHERE taskId = ?', [req.params.id]);
    await dbRun('DELETE FROM status_transitions WHERE taskId = ?', [req.params.id]);
    await dbRun('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Task deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET stats
app.get('/api/stats', async (req, res) => {
  try {
    const total = await dbGet('SELECT COUNT(*) as count FROM tasks');
    const completed = await dbGet('SELECT COUNT(*) as count FROM tasks WHERE status = "completed"');
    const pending = await dbGet('SELECT COUNT(*) as count FROM tasks WHERE status = "pending"');
    const backlog = await dbGet('SELECT COUNT(*) as count FROM tasks WHERE status = "backlog"');

    res.json({
      total: total.count,
      completed: completed.count,
      pending: pending.count,
      backlog: backlog.count,
      categories: await dbAll('SELECT DISTINCT category FROM tasks'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== NOTES API ====================

app.get('/api/tasks/:id/notes', async (req, res) => {
  try {
    const notes = await dbAll(
      'SELECT * FROM notes WHERE taskId = ? ORDER BY createdAt DESC',
      [req.params.id]
    );
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/notes', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const result = await dbRun(
      'INSERT INTO notes (taskId, content, type) VALUES (?, ?, ?)',
      [req.params.id, content, 'note']
    );
    const note = await dbGet('SELECT * FROM notes WHERE id = ?', [result.lastID]);
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM notes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Note deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TIME TRACKING API ====================

app.post('/api/tasks/:id/timer/start', async (req, res) => {
  try {
    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const active = await dbGet('SELECT * FROM timeLog WHERE taskId = ? AND endTime IS NULL', [req.params.id]);
    if (active) return res.status(400).json({ error: 'Timer already running for this task' });

    const now = new Date().toISOString();
    await dbRun('INSERT INTO timeLog (taskId, startTime) VALUES (?, ?)', [req.params.id, now]);
    await dbRun('UPDATE tasks SET startedAt = ? WHERE id = ?', [now, req.params.id]);
    await logEvent(req.params.id, 'Timer started');

    res.json({ message: 'Timer started', taskId: req.params.id, startTime: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/timer/stop', async (req, res) => {
  try {
    const active = await dbGet('SELECT * FROM timeLog WHERE taskId = ? AND endTime IS NULL', [req.params.id]);
    if (!active) return res.status(400).json({ error: 'No active timer for this task' });

    const now = new Date().toISOString();
    const duration = Math.floor((new Date(now) - new Date(active.startTime)) / 1000);

    await dbRun('UPDATE timeLog SET endTime = ?, duration = ? WHERE id = ?', [now, duration, active.id]);
    await dbRun('UPDATE tasks SET timeSpent = timeSpent + ?, startedAt = NULL WHERE id = ?', [duration, req.params.id]);
    await logEvent(req.params.id, `Timer stopped (${formatDurationServer(duration)})`);

    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Timer stopped', duration, totalTimeSpent: task.timeSpent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id/time', async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM timeLog WHERE taskId = ? ORDER BY startTime DESC', [req.params.id]);
    const task = await dbGet('SELECT timeSpent, startedAt FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ totalTimeSpent: task ? task.timeSpent : 0, startedAt: task ? task.startedAt : null, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/timer/active', async (req, res) => {
  try {
    const active = await dbAll(`
      SELECT tl.*, t.name as taskName FROM timeLog tl
      JOIN tasks t ON t.id = tl.taskId
      WHERE tl.endTime IS NULL
    `);
    res.json(active);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== SUBTASKS API ====================

app.get('/api/tasks/:id/subtasks', async (req, res) => {
  try {
    const subtasks = await dbAll('SELECT * FROM subtasks WHERE taskId = ? ORDER BY sortOrder, id', [req.params.id]);
    res.json(subtasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/subtasks', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Subtask name required' });

    const maxOrder = await dbGet('SELECT MAX(sortOrder) as max FROM subtasks WHERE taskId = ?', [req.params.id]);
    const sortOrder = (maxOrder && maxOrder.max !== null) ? maxOrder.max + 1 : 0;

    const result = await dbRun(
      'INSERT INTO subtasks (taskId, name, sortOrder) VALUES (?, ?, ?)',
      [req.params.id, name, sortOrder]
    );
    const subtask = await dbGet('SELECT * FROM subtasks WHERE id = ?', [result.lastID]);
    res.status(201).json(subtask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/subtasks/:id', async (req, res) => {
  try {
    const { name, completed, sortOrder } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (completed !== undefined) { updates.push('completed = ?'); values.push(completed ? 1 : 0); }
    if (sortOrder !== undefined) { updates.push('sortOrder = ?'); values.push(sortOrder); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await dbRun(`UPDATE subtasks SET ${updates.join(', ')} WHERE id = ?`, values);
    const subtask = await dbGet('SELECT * FROM subtasks WHERE id = ?', [req.params.id]);
    res.json(subtask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/subtasks/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM subtasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Subtask deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== RECURRING TASKS API ====================

app.post('/api/tasks/:id/recurring', async (req, res) => {
  try {
    const { pattern } = req.body;
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(pattern)) {
      return res.status(400).json({ error: 'Invalid pattern. Must be daily, weekly, monthly, or yearly' });
    }

    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await dbRun('DELETE FROM recurring WHERE taskId = ?', [req.params.id]);

    const nextOccurrence = calculateNextOccurrence(pattern, new Date());
    const result = await dbRun(
      'INSERT INTO recurring (taskId, pattern, nextOccurrence) VALUES (?, ?, ?)',
      [req.params.id, pattern, nextOccurrence.toISOString()]
    );

    await dbRun('UPDATE tasks SET recurring = ? WHERE id = ?', [pattern, req.params.id]);

    const rec = await dbGet('SELECT * FROM recurring WHERE id = ?', [result.lastID]);
    res.status(201).json(rec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id/recurring', async (req, res) => {
  try {
    const rec = await dbGet('SELECT * FROM recurring WHERE taskId = ?', [req.params.id]);
    res.json(rec || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id/recurring', async (req, res) => {
  try {
    await dbRun('DELETE FROM recurring WHERE taskId = ?', [req.params.id]);
    await dbRun('UPDATE tasks SET recurring = NULL WHERE id = ?', [req.params.id]);
    res.json({ message: 'Recurring rule removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recurring/generate', async (req, res) => {
  try {
    const count = await generateRecurringTasks();
    res.json({ message: `Generated ${count} recurring tasks`, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function calculateNextOccurrence(pattern, fromDate) {
  const next = new Date(fromDate);
  switch (pattern) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  return next;
}

async function generateRecurringTasks() {
  const now = new Date().toISOString();
  const dueRecurring = await dbAll(
    'SELECT r.*, t.name, t.description, t.category, t.priority FROM recurring r JOIN tasks t ON t.id = r.taskId WHERE r.nextOccurrence <= ?',
    [now]
  );

  let count = 0;
  for (const rec of dueRecurring) {
    const result = await dbRun(
      'INSERT INTO tasks (name, description, category, priority) VALUES (?, ?, ?, ?)',
      [rec.name, rec.description, rec.category, rec.priority]
    );
    await logEvent(result.lastID, `Recurring task created (${rec.pattern})`);

    const nextOccurrence = calculateNextOccurrence(rec.pattern, new Date(rec.nextOccurrence));
    await dbRun(
      'UPDATE recurring SET lastOccurrence = ?, nextOccurrence = ? WHERE id = ?',
      [now, nextOccurrence.toISOString(), rec.id]
    );
    count++;
  }
  return count;
}

// ==================== BULK OPERATIONS API ====================

app.post('/api/tasks/bulk/complete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of task ids required' });
    }

    // Track transitions before bulk complete
    for (const id of ids) {
      const t = await dbGet('SELECT status FROM tasks WHERE id = ?', [id]);
      if (t && t.status !== 'completed') {
        await dbRun('INSERT INTO status_transitions (taskId, fromStatus, toStatus) VALUES (?, ?, ?)', [id, t.status, 'completed']);
      }
    }
    const placeholders = ids.map(() => '?').join(',');
    await dbRun(
      `UPDATE tasks SET status = 'completed', completedAt = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
      ids
    );
    for (const id of ids) {
      await logEvent(id, 'Status changed to completed (bulk)');
    }
    res.json({ message: `${ids.length} tasks completed`, ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/bulk/delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of task ids required' });
    }

    const placeholders = ids.map(() => '?').join(',');
    await dbRun(`DELETE FROM subtasks WHERE taskId IN (${placeholders})`, ids);
    await dbRun(`DELETE FROM timeLog WHERE taskId IN (${placeholders})`, ids);
    await dbRun(`DELETE FROM recurring WHERE taskId IN (${placeholders})`, ids);
    await dbRun(`DELETE FROM notes WHERE taskId IN (${placeholders})`, ids);
    await dbRun(`DELETE FROM status_transitions WHERE taskId IN (${placeholders})`, ids);
    await dbRun(`DELETE FROM tasks WHERE id IN (${placeholders})`, ids);
    res.json({ message: `${ids.length} tasks deleted`, ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/bulk/update', async (req, res) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of task ids required' });
    }

    const setClauses = [];
    const values = [];

    if (updates.priority && ['low', 'medium', 'high'].includes(updates.priority)) {
      setClauses.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.category) {
      setClauses.push('category = ?');
      values.push(updates.category);
    }
    if (updates.status) {
      setClauses.push('status = ?');
      values.push(updates.status);
      if (updates.status === 'completed') {
        setClauses.push('completedAt = CURRENT_TIMESTAMP');
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    // Track status transitions for bulk update
    if (updates.status) {
      for (const id of ids) {
        const t = await dbGet('SELECT status FROM tasks WHERE id = ?', [id]);
        if (t && t.status !== updates.status) {
          await dbRun('INSERT INTO status_transitions (taskId, fromStatus, toStatus) VALUES (?, ?, ?)', [id, t.status, updates.status]);
        }
      }
    }

    const placeholders = ids.map(() => '?').join(',');
    await dbRun(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`,
      [...values, ...ids]
    );
    res.json({ message: `${ids.length} tasks updated`, ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== FLOW ANALYTICS API ====================

const STATUS_ORDER = { backlog: 0, pending: 1, completed: 2, archived: 3 };

app.get('/api/analytics/flow', async (req, res) => {
  try {
    const transitions = await dbAll(`
      SELECT fromStatus, toStatus, DATE(createdAt) as date, COUNT(*) as count
      FROM status_transitions
      WHERE createdAt >= DATE('now', '-30 days')
      GROUP BY fromStatus, toStatus, DATE(createdAt)
      ORDER BY date
    `);

    const byDate = {};
    transitions.forEach(t => {
      if (!byDate[t.date]) byDate[t.date] = { progressions: 0, regressions: 0, details: [] };
      const fromIdx = STATUS_ORDER[t.fromStatus] ?? 0;
      const toIdx = STATUS_ORDER[t.toStatus] ?? 0;
      if (toIdx > fromIdx) {
        byDate[t.date].progressions += t.count;
      } else {
        byDate[t.date].regressions += t.count;
      }
      byDate[t.date].details.push({ from: t.fromStatus, to: t.toStatus, count: t.count });
    });

    // Summary totals
    const summary = { totalProgressions: 0, totalRegressions: 0 };
    const dates = Object.keys(byDate).sort();
    const chartData = dates.map(d => {
      summary.totalProgressions += byDate[d].progressions;
      summary.totalRegressions += byDate[d].regressions;
      return { date: d, progressions: byDate[d].progressions, regressions: byDate[d].regressions };
    });

    // Transition matrix
    const matrix = {};
    transitions.forEach(t => {
      const key = `${t.fromStatus}->${t.toStatus}`;
      matrix[key] = (matrix[key] || 0) + t.count;
    });

    res.json({ summary, chartData, matrix });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/cumulative-flow', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Current counts per status
    const currentCounts = {};
    const rows = await dbAll("SELECT status, COUNT(*) as count FROM tasks GROUP BY status");
    rows.forEach(r => { currentCounts[r.status] = r.count; });

    // Fill in zeros for missing statuses
    ['backlog', 'pending', 'completed', 'archived'].forEach(s => {
      if (!currentCounts[s]) currentCounts[s] = 0;
    });

    // Get all transitions in the period, ordered newest first
    const transitions = await dbAll(`
      SELECT fromStatus, toStatus, DATE(createdAt) as date
      FROM status_transitions
      WHERE createdAt >= DATE('now', '-${days} days')
      ORDER BY createdAt DESC
    `);

    // Build daily snapshots by working backward from current state
    const today = new Date();
    const snapshots = [];
    let counts = { ...currentCounts };
    let transIdx = 0;

    for (let i = 0; i <= days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      // Reverse transitions that happened on this date to reconstruct previous state
      while (transIdx < transitions.length && transitions[transIdx].date === dateStr) {
        const t = transitions[transIdx];
        // Reverse: add back to fromStatus, remove from toStatus
        counts[t.fromStatus] = (counts[t.fromStatus] || 0) + 1;
        counts[t.toStatus] = (counts[t.toStatus] || 0) - 1;
        transIdx++;
      }

      snapshots.unshift({
        date: dateStr,
        backlog: Math.max(0, counts.backlog || 0),
        pending: Math.max(0, counts.pending || 0),
        completed: Math.max(0, counts.completed || 0),
        archived: Math.max(0, counts.archived || 0)
      });
    }

    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/velocity', async (req, res) => {
  try {
    // Average time spent in each status (based on transitions)
    const velocity = await dbAll(`
      SELECT
        st1.fromStatus as status,
        AVG(
          CAST((julianday(st1.createdAt) - julianday(
            COALESCE(
              (SELECT MAX(st2.createdAt) FROM status_transitions st2
               WHERE st2.taskId = st1.taskId AND st2.id < st1.id),
              (SELECT createdAt FROM tasks WHERE id = st1.taskId)
            )
          )) * 86400 AS INTEGER)
        ) as avgSeconds,
        COUNT(*) as transitionCount
      FROM status_transitions st1
      GROUP BY st1.fromStatus
    `);

    // Also compute overall cycle time: pending -> completed
    const cycleTime = await dbAll(`
      SELECT
        AVG(
          CAST((julianday(t2.createdAt) - julianday(t1.createdAt)) * 86400 AS INTEGER)
        ) as avgSeconds,
        COUNT(*) as count
      FROM status_transitions t1
      JOIN status_transitions t2 ON t1.taskId = t2.taskId
      WHERE t1.toStatus = 'pending' AND t2.toStatus = 'completed'
        AND t2.createdAt > t1.createdAt
        AND NOT EXISTS (
          SELECT 1 FROM status_transitions t3
          WHERE t3.taskId = t1.taskId AND t3.toStatus = 'completed'
            AND t3.createdAt > t1.createdAt AND t3.createdAt < t2.createdAt
        )
    `);

    res.json({
      byStatus: velocity.map(v => ({
        status: v.status,
        avgSeconds: Math.round(v.avgSeconds || 0),
        transitionCount: v.transitionCount
      })),
      cycleTime: cycleTime[0] ? {
        avgSeconds: Math.round(cycleTime[0].avgSeconds || 0),
        count: cycleTime[0].count
      } : { avgSeconds: 0, count: 0 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== WIP LIMITS API ====================

app.get('/api/settings/wip-limits', async (req, res) => {
  try {
    const val = await getSetting('wip_limits');
    res.json(val ? JSON.parse(val) : { backlog: null, pending: null, completed: null, archived: null });
  } catch (err) {
    res.json({ backlog: null, pending: null, completed: null, archived: null });
  }
});

app.post('/api/settings/wip-limits', async (req, res) => {
  try {
    const limits = req.body;
    await setSetting('wip_limits', JSON.stringify(limits));
    res.json({ message: 'WIP limits saved', limits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== AI INSIGHTS API ====================

const INSIGHTS_SYSTEM_PROMPT = `You are a productivity analyst reviewing a personal task management system. You have access to the complete data snapshot of someone's task dashboard.

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

async function gatherInsightsData() {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];

  const tasks = await dbAll(`
    SELECT t.*,
      (SELECT COUNT(*) FROM subtasks WHERE taskId = t.id) as subtaskTotal,
      (SELECT COUNT(*) FROM subtasks WHERE taskId = t.id AND completed = 1) as subtaskDone
    FROM tasks t ORDER BY t.createdAt DESC
  `);

  const total = tasks.length;
  const backlog = tasks.filter(t => t.status === 'backlog').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const archived = tasks.filter(t => t.status === 'archived').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const overdue = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'completed' && t.status !== 'archived');
  const dueToday = tasks.filter(t => t.dueDate && t.dueDate === today && t.status !== 'completed');

  // Task aging (pending + backlog)
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'backlog');
  const agingBuckets = { over30days: [], over14days: [], over7days: [], recentCount: 0 };
  pendingTasks.forEach(t => {
    const ageDays = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);
    const info = { id: t.id, name: t.name, ageDays, priority: t.priority, category: t.category };
    if (ageDays > 30) agingBuckets.over30days.push(info);
    else if (ageDays > 14) agingBuckets.over14days.push(info);
    else if (ageDays > 7) agingBuckets.over7days.push(info);
    else agingBuckets.recentCount++;
  });

  const timeByCategory = await dbAll(`
    SELECT category, SUM(timeSpent) as totalTime, COUNT(*) as taskCount
    FROM tasks GROUP BY category ORDER BY totalTime DESC
  `);

  const avgTime = await dbGet(`SELECT AVG(timeSpent) as avg FROM tasks WHERE status = 'completed' AND timeSpent > 0`);
  const totalTimeTracked = await dbGet(`SELECT SUM(timeSpent) as total FROM tasks`);

  const completions30d = await dbAll(`
    SELECT DATE(completedAt) as date, COUNT(*) as count
    FROM tasks WHERE completedAt IS NOT NULL AND completedAt >= DATE('now', '-30 days')
    GROUP BY DATE(completedAt) ORDER BY date
  `);

  const activeTasks = tasks.filter(t => t.status === 'pending' || t.status === 'backlog');
  const priorityBreakdown = {
    high: activeTasks.filter(t => t.priority === 'high').length,
    medium: activeTasks.filter(t => t.priority === 'medium').length,
    low: activeTasks.filter(t => t.priority === 'low').length
  };

  // Flow data for insights
  const recentTransitions = await dbAll(`
    SELECT fromStatus, toStatus, COUNT(*) as count
    FROM status_transitions
    WHERE createdAt >= DATE('now', '-30 days')
    GROUP BY fromStatus, toStatus
  `);

  const recurringTasks = await dbAll(`SELECT r.*, t.name, t.status FROM recurring r JOIN tasks t ON t.id = r.taskId`);
  const recentActivity = await dbAll(`
    SELECT n.*, t.name as taskName FROM notes n JOIN tasks t ON t.id = n.taskId
    ORDER BY n.createdAt DESC LIMIT 50
  `);
  const categories = await dbAll('SELECT * FROM categories ORDER BY name');

  const fmtDur = (s) => { if (!s) return '0s'; const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:m>0?`${m}m`:`${s}s`; };

  return {
    timestamp: now,
    summary: { total, backlog, pending, completed, archived, completionRate },
    overdue: overdue.map(t => ({ id: t.id, name: t.name, dueDate: t.dueDate, priority: t.priority, category: t.category })),
    dueToday: dueToday.map(t => ({ id: t.id, name: t.name, priority: t.priority })),
    aging: agingBuckets,
    timeByCategory: timeByCategory.map(t => ({ category: t.category, totalTime: fmtDur(t.totalTime), taskCount: t.taskCount })),
    avgCompletionTime: fmtDur(Math.round(avgTime.avg || 0)),
    totalTimeTracked: fmtDur(totalTimeTracked.total || 0),
    completions30d,
    priorityBreakdown,
    recurringTasks: recurringTasks.map(r => ({ name: r.name, pattern: r.pattern, nextOccurrence: r.nextOccurrence, status: r.status })),
    recentActivity: recentActivity.slice(0, 20).map(a => ({ task: a.taskName, content: a.content, type: a.type, time: a.createdAt })),
    flowTransitions: recentTransitions.map(t => ({ from: t.fromStatus, to: t.toStatus, count: t.count })),
    categories: categories.map(c => c.name),
    allTasks: tasks.map(t => ({
      id: t.id, name: t.name, status: t.status, priority: t.priority, category: t.category,
      dueDate: t.dueDate, createdAt: t.createdAt, completedAt: t.completedAt,
      timeSpent: fmtDur(t.timeSpent), subtasks: t.subtaskTotal > 0 ? `${t.subtaskDone}/${t.subtaskTotal}` : null,
      recurring: t.recurring
    }))
  };
}

let insightsCache = { data: null, generatedAt: null };

app.post('/api/insights', async (req, res) => {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return res.status(500).json({ error: 'No API key configured. Go to Settings to add your Gemini API key, or start the server with: GEMINI_API_KEY=... node server.js' });
    }

    // Return cached result if less than 5 minutes old
    if (insightsCache.data && insightsCache.generatedAt) {
      const ageMs = Date.now() - new Date(insightsCache.generatedAt).getTime();
      if (ageMs < 5 * 60 * 1000) {
        return res.json({ insights: insightsCache.data, generatedAt: insightsCache.generatedAt, cached: true });
      }
    }

    const data = await gatherInsightsData();

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSIGHTS_SYSTEM_PROMPT }] },
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
    const insights = result.candidates[0].content.parts[0].text;
    const generatedAt = new Date().toISOString();

    insightsCache = { data: insights, generatedAt };

    res.json({ insights, generatedAt, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Also expose the raw data snapshot for debugging
app.get('/api/insights/data', async (req, res) => {
  try {
    const data = await gatherInsightsData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== START SERVER ====================

app.listen(PORT, async () => {
  console.log(`\n🚀 Task Dashboard running at http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/tasks`);
  console.log('\nCtrl+C to stop\n');

  try {
    const count = await generateRecurringTasks();
    if (count > 0) console.log(`✓ Generated ${count} recurring tasks`);
  } catch (err) {
    console.error('Error generating recurring tasks:', err);
  }

  setInterval(async () => {
    try {
      const count = await generateRecurringTasks();
      if (count > 0) console.log(`✓ Generated ${count} recurring tasks`);
    } catch (err) {
      console.error('Error generating recurring tasks:', err);
    }
  }, 60 * 60 * 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  db.close();
  process.exit(0);
});
