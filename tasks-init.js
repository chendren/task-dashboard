#!/usr/bin/env node
/**
 * Task Dashboard — Database Schema Reference
 *
 * Creates the SQLite tables used by the task dashboard: tasks, categories,
 * subtasks, notes, time logs, recurring patterns, status transitions, settings,
 * and WIP limits. Also seeds default categories if the database is fresh.
 *
 * You don't normally need to run this — server.js creates the schema automatically
 * on first startup. This file exists as a reference for the full database structure
 * and can be used to re-initialize a blank database if needed.
 *
 * Usage: node tasks-init.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(process.env.HOME, '.openclaw/workspace/tasks.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to database:', dbPath);
});

db.serialize(() => {
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Tasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
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
  `, (err) => {
    if (err) console.error('Error creating tasks table:', err);
    else console.log('✓ Tasks table ready');
  });

  // Categories table
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating categories table:', err);
    else console.log('✓ Categories table ready');
  });

  // Seed default categories
  const defaultCategories = [
    ['general', '#64748b'],
    ['work', '#3b82f6'],
    ['personal', '#8b5cf6'],
    ['health', '#22c55e'],
    ['learning', '#f59e0b']
  ];
  const catStmt = db.prepare('INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)');
  defaultCategories.forEach(([name, color]) => catStmt.run(name, color));
  catStmt.finalize(() => console.log('✓ Default categories seeded'));

  // Recurring patterns table
  db.run(`
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      pattern TEXT NOT NULL CHECK(pattern IN ('daily', 'weekly', 'monthly', 'yearly')),
      daysOfWeek TEXT,
      dayOfMonth INTEGER,
      lastOccurrence TEXT,
      nextOccurrence TEXT,
      FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('Error creating recurring table:', err);
    else console.log('✓ Recurring patterns table ready');
  });

  // Time tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS timeLog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      startTime TEXT NOT NULL,
      endTime TEXT,
      duration INTEGER,
      FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('Error creating timeLog table:', err);
    else console.log('✓ Time log table ready');
  });

  // Subtasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      name TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      sortOrder INTEGER DEFAULT 0,
      FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('Error creating subtasks table:', err);
    else console.log('✓ Subtasks table ready');
  });

  // Notes / activity log table
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'note' CHECK(type IN ('note', 'event')),
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('Error creating notes table:', err);
    else console.log('✓ Notes table ready');
  });

  // Status transitions table (for flow analytics)
  db.run(`
    CREATE TABLE IF NOT EXISTS status_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId INTEGER NOT NULL,
      fromStatus TEXT NOT NULL,
      toStatus TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('Error creating status_transitions table:', err);
    else console.log('✓ Status transitions table ready');
  });

  // Settings table (encrypted key-value store)
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating settings table:', err);
    else console.log('✓ Settings table ready');
  });
});

db.close((err) => {
  if (err) {
    console.error('Error closing database:', err);
    process.exit(1);
  }
  console.log('\n✅ Database initialized successfully at:', dbPath);
});
