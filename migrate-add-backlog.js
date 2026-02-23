#!/usr/bin/env node
/**
 * Task Dashboard — Database Migration: Backlog Status + Status Transitions
 *
 * One-time migration that adds the 'backlog' status to the task workflow and creates
 * the status_transitions table for tracking how tasks move between columns over time.
 * This data powers the flow analytics and cycle time charts in the dashboard.
 *
 * Automatically backs up the database before making changes.
 *
 * Usage: node migrate-add-backlog.js   (run once, safe to re-run)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.env.HOME, '.openclaw/workspace/tasks.db');
const backupPath = dbPath + '.bak-' + Date.now();

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

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

async function migrate() {
  // Backup
  console.log('Backing up database...');
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backup saved to: ${backupPath}`);

  const db = new sqlite3.Database(dbPath);

  try {
    // Check if migration already done
    const check = await dbGet(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
    if (check && check.sql.includes("'backlog'")) {
      console.log('Migration already applied (backlog status exists). Checking status_transitions...');
    } else {
      console.log('\nMigrating tasks table...');

      await dbRun(db, 'PRAGMA foreign_keys = OFF');
      await dbRun(db, 'BEGIN TRANSACTION');

      // Create new table with updated CHECK
      await dbRun(db, `
        CREATE TABLE tasks_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT DEFAULT 'general',
          priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
          dueDate TEXT,
          status TEXT DEFAULT 'pending' CHECK(status IN ('backlog', 'pending', 'completed', 'archived')),
          recurring TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          completedAt TEXT,
          startedAt TEXT,
          timeSpent INTEGER DEFAULT 0
        )
      `);

      // Copy data
      await dbRun(db, 'INSERT INTO tasks_new SELECT * FROM tasks');

      // Drop old, rename new
      await dbRun(db, 'DROP TABLE tasks');
      await dbRun(db, 'ALTER TABLE tasks_new RENAME TO tasks');

      await dbRun(db, 'COMMIT');
      await dbRun(db, 'PRAGMA foreign_keys = ON');

      console.log('Tasks table migrated (backlog status added)');
    }

    // Create status_transitions table
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS status_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taskId INTEGER NOT NULL,
        fromStatus TEXT NOT NULL,
        toStatus TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    console.log('Status transitions table ready');

    // Backfill transitions from notes events
    console.log('\nBackfilling transitions from activity log...');
    const events = await dbAll(db, `
      SELECT n.taskId, n.content, n.createdAt
      FROM notes n
      WHERE n.content LIKE 'Status changed to %'
      ORDER BY n.taskId, n.createdAt ASC
    `);

    // Group by task
    const byTask = {};
    for (const ev of events) {
      if (!byTask[ev.taskId]) byTask[ev.taskId] = [];
      const match = ev.content.match(/Status changed to (\w+)/);
      if (match) {
        byTask[ev.taskId].push({ toStatus: match[1], createdAt: ev.createdAt });
      }
    }

    let backfilled = 0;
    // Check if we already have transitions
    const existing = await dbGet(db, 'SELECT COUNT(*) as count FROM status_transitions');
    if (existing.count > 0) {
      console.log(`Already have ${existing.count} transitions, skipping backfill`);
    } else {
      for (const [taskId, transitions] of Object.entries(byTask)) {
        let prevStatus = 'pending'; // default initial status
        for (const t of transitions) {
          if (prevStatus !== t.toStatus) {
            await dbRun(db,
              'INSERT INTO status_transitions (taskId, fromStatus, toStatus, createdAt) VALUES (?, ?, ?, ?)',
              [taskId, prevStatus, t.toStatus, t.createdAt]
            );
            backfilled++;
          }
          prevStatus = t.toStatus;
        }
      }
      console.log(`Backfilled ${backfilled} transitions from ${Object.keys(byTask).length} tasks`);
    }

    console.log('\nMigration complete!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    console.log(`Restore backup from: ${backupPath}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
