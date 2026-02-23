#!/usr/bin/env node
/**
 * Seed 27 realistic demo tasks to showcase all dashboard capabilities.
 * Run: node seed-demo.js
 */

const BASE = 'http://localhost:3000';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function daysFromNow(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
const today = daysFromNow(0);

async function seed() {
  console.log('Adding categories...');
  await api('POST', '/api/categories', { name: 'finance', color: '#06b6d4' });
  await api('POST', '/api/categories', { name: 'home', color: '#f43f5e' });

  // Define 27 tasks with rich data
  const tasks = [
    // === BACKLOG (6 tasks — ideas not yet committed to) ===
    { name: 'Research home solar panel options', category: 'home', priority: 'low', description: 'Compare providers, costs, ROI timeline. Check local rebates and incentives.', daysOld: 22 },
    { name: 'Build personal portfolio website', category: 'learning', priority: 'medium', description: 'Design and develop a portfolio site. Consider Next.js or Astro.', daysOld: 18 },
    { name: 'Learn Rust basics', category: 'learning', priority: 'low', description: 'Work through The Rust Programming Language book. Focus on ownership model.', daysOld: 35 },
    { name: 'Plan summer vacation', category: 'personal', priority: 'low', description: 'Research destinations, flights, accommodations. Budget: $3000.', daysOld: 12 },
    { name: 'Evaluate password manager options', category: 'personal', priority: 'medium', description: 'Compare 1Password, Bitwarden, KeePass. Need family sharing support.', daysOld: 8 },
    { name: 'Set up automated backups for NAS', category: 'home', priority: 'high', description: 'Configure offsite backup for home NAS. Consider Backblaze B2 or rsync to cloud.', daysOld: 15 },

    // === PENDING (10 tasks — actively planned/in-progress) ===
    { name: 'Prepare Q1 performance review', category: 'work', priority: 'high', description: 'Compile accomplishments, metrics, and goals for quarterly review meeting.', dueDate: daysFromNow(3), daysOld: 7,
      subtasks: ['Gather project metrics', 'Write self-assessment', 'List key accomplishments', 'Draft goals for Q2'] },
    { name: 'Fix authentication timeout bug', category: 'work', priority: 'high', description: 'Users getting logged out after 5 minutes. JWT refresh token not being sent. See issue #247.', dueDate: daysFromNow(1), daysOld: 3,
      subtasks: ['Reproduce locally', 'Check token refresh logic', 'Add retry mechanism', 'Write regression test'] },
    { name: 'Update project dependencies', category: 'work', priority: 'medium', description: 'Run npm audit, update vulnerable packages. Test thoroughly after update.', dueDate: daysFromNow(7), daysOld: 5 },
    { name: 'Meal prep for the week', category: 'health', priority: 'medium', description: 'Plan meals, grocery shop, prep Sunday. Focus on high-protein lunches.', dueDate: today, daysOld: 2, recurring: 'weekly',
      subtasks: ['Plan menu', 'Write grocery list', 'Go shopping', 'Prep containers'] },
    { name: 'Schedule annual physical', category: 'health', priority: 'high', description: 'Overdue by 2 months. Call Dr. Martinez office.', dueDate: daysAgo(2), daysOld: 14 },
    { name: 'Review and pay quarterly taxes', category: 'finance', priority: 'high', description: 'Q1 estimated tax payment due. Review income, calculate payment, submit via IRS Direct Pay.', dueDate: daysFromNow(5), daysOld: 10,
      subtasks: ['Calculate Q1 income', 'Determine estimated tax', 'Submit payment', 'File records'] },
    { name: 'Organize garage', category: 'home', priority: 'low', description: 'Sort through boxes, donate unused items, install new shelving unit.', dueDate: daysFromNow(14), daysOld: 20,
      subtasks: ['Sort boxes into keep/donate/trash', 'Take donations to Goodwill', 'Buy shelving unit', 'Install shelves', 'Organize tools'] },
    { name: 'Complete Docker certification course', category: 'learning', priority: 'medium', description: 'Finish remaining 4 modules of the Docker & Kubernetes certification course on Udemy.', dueDate: daysFromNow(21), daysOld: 30,
      subtasks: ['Module 5: Networking', 'Module 6: Volumes', 'Module 7: Docker Compose', 'Module 8: Kubernetes Intro', 'Take practice exam'] },
    { name: 'Write blog post on task management', category: 'personal', priority: 'low', description: 'Share experience building this task dashboard. Cover tech stack, features, lessons learned.', daysOld: 4 },
    { name: 'Run 5K training plan', category: 'health', priority: 'medium', description: 'Week 4 of Couch-to-5K program. 3 runs per week.', dueDate: daysFromNow(0), daysOld: 28, recurring: 'daily',
      subtasks: ['Monday: Run/Walk intervals 25min', 'Wednesday: Run/Walk intervals 28min', 'Friday: Run 20min continuous'] },

    // === COMPLETED (8 tasks — recently finished) ===
    { name: 'Set up CI/CD pipeline for API', category: 'work', priority: 'high', description: 'Configure GitHub Actions for automated testing and deployment to staging.', daysOld: 15, completedDaysAgo: 2, timeSpent: 7200 },
    { name: 'File 2025 tax return', category: 'finance', priority: 'high', description: 'Gather W-2, 1099s, deductions. Filed via TurboTax.', daysOld: 25, completedDaysAgo: 5, timeSpent: 10800 },
    { name: 'Replace kitchen faucet', category: 'home', priority: 'medium', description: 'Old faucet was leaking. Installed Moen Arbor pull-down.', daysOld: 10, completedDaysAgo: 3, timeSpent: 3600 },
    { name: 'Complete AWS Solutions Architect practice exam', category: 'learning', priority: 'medium', description: 'Scored 82% on practice exam. Weak areas: VPC networking, IAM policies.', daysOld: 20, completedDaysAgo: 1, timeSpent: 5400 },
    { name: 'Dentist appointment', category: 'health', priority: 'medium', description: 'Regular 6-month checkup and cleaning. No cavities.', daysOld: 8, completedDaysAgo: 4, timeSpent: 3600 },
    { name: 'Refactor database migration system', category: 'work', priority: 'medium', description: 'Moved from manual SQL scripts to automated migrations with version tracking.', daysOld: 18, completedDaysAgo: 7, timeSpent: 14400,
      subtasks: ['Design migration framework', 'Implement runner', 'Migrate existing scripts', 'Add rollback support', 'Write documentation'] },
    { name: 'Set up home office ergonomics', category: 'health', priority: 'low', description: 'New standing desk, monitor arm, keyboard tray. Much better posture now.', daysOld: 30, completedDaysAgo: 10, timeSpent: 1800 },
    { name: 'Create monthly budget spreadsheet', category: 'finance', priority: 'medium', description: 'Built comprehensive budget tracker in Google Sheets with auto-categorization.', daysOld: 22, completedDaysAgo: 8, timeSpent: 5400 },

    // === ARCHIVED (3 tasks — done and out of sight) ===
    { name: 'Migrate email to ProtonMail', category: 'personal', priority: 'medium', description: 'Completed migration from Gmail. All contacts and filters transferred.', daysOld: 45, completedDaysAgo: 30, timeSpent: 7200 },
    { name: 'Fix memory leak in worker service', category: 'work', priority: 'high', description: 'Identified unbounded cache in event processor. Added LRU eviction policy.', daysOld: 40, completedDaysAgo: 35, timeSpent: 10800 },
    { name: 'Read "Designing Data-Intensive Applications"', category: 'learning', priority: 'low', description: 'Excellent book. Key takeaways on distributed systems, replication, partitioning.', daysOld: 60, completedDaysAgo: 25, timeSpent: 36000 },
  ];

  const statusMap = {};
  // First 6 are backlog, next 10 pending, next 8 completed, last 3 archived
  tasks.forEach((t, i) => {
    if (i < 6) statusMap[i] = 'backlog';
    else if (i < 16) statusMap[i] = 'pending';
    else if (i < 24) statusMap[i] = 'completed';
    else statusMap[i] = 'archived';
  });

  console.log('Creating 27 tasks...\n');

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const targetStatus = statusMap[i];

    // Create task
    const created = await api('POST', '/api/tasks', {
      name: t.name,
      description: t.description,
      category: t.category,
      priority: t.priority,
      dueDate: t.dueDate || null
    });
    const id = created.id;
    const statusLabel = targetStatus.toUpperCase().padEnd(9);
    console.log(`  [${statusLabel}] ${t.name}`);

    // Backdate createdAt directly via DB hack through import
    // We'll use the update endpoint to set status instead

    // Set recurring if specified
    if (t.recurring) {
      await api('POST', `/api/tasks/${id}/recurring`, { pattern: t.recurring });
    }

    // Add subtasks
    if (t.subtasks) {
      for (const stName of t.subtasks) {
        await api('POST', `/api/tasks/${id}/subtasks`, { name: stName });
      }
      // Mark some subtasks as done for completed tasks or partially for pending
      if (targetStatus === 'completed' || targetStatus === 'archived') {
        const subs = await api('GET', `/api/tasks/${id}/subtasks`);
        for (const sub of subs) {
          await api('PUT', `/api/subtasks/${sub.id}`, { completed: true });
        }
      } else if (targetStatus === 'pending' && t.subtasks.length > 1) {
        // Complete first 1-2 subtasks for pending tasks
        const subs = await api('GET', `/api/tasks/${id}/subtasks`);
        const doneCount = Math.min(2, Math.floor(subs.length / 2));
        for (let j = 0; j < doneCount; j++) {
          await api('PUT', `/api/subtasks/${subs[j].id}`, { completed: true });
        }
      }
    }

    // Add notes for some tasks
    if (targetStatus === 'pending' || targetStatus === 'completed') {
      await api('POST', `/api/tasks/${id}/notes`, { content: `Started working on this task` });
      if (targetStatus === 'completed') {
        await api('POST', `/api/tasks/${id}/notes`, { content: 'Completed successfully' });
      }
    }

    // Move to target status (creates transitions)
    if (targetStatus === 'backlog') {
      await api('PUT', `/api/tasks/${id}`, { status: 'backlog' });
    } else if (targetStatus === 'completed') {
      await api('PUT', `/api/tasks/${id}`, { status: 'completed' });
    } else if (targetStatus === 'archived') {
      await api('PUT', `/api/tasks/${id}`, { status: 'completed' });
      await api('PUT', `/api/tasks/${id}`, { status: 'archived' });
    }
    // 'pending' is the default, no change needed
  }

  // Now backdate tasks via direct DB update for realistic aging
  console.log('\nBackdating tasks for realistic aging...');
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const dbPath = path.join(process.env.HOME, '.openclaw/workspace/tasks.db');
  const db = new sqlite3.Database(dbPath);

  function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  // Get all tasks we just created (skip pre-existing ones with id <= 2)
  const allTasks = await new Promise((resolve, reject) => {
    db.all('SELECT id, name, status FROM tasks WHERE id > 2 ORDER BY id', (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });

  for (let i = 0; i < allTasks.length && i < tasks.length; i++) {
    const t = tasks[i];
    const row = allTasks[i];
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - t.daysOld);

    const updates = [`createdAt = '${createdAt.toISOString()}'`];

    if (t.completedDaysAgo) {
      const completedAt = new Date();
      completedAt.setDate(completedAt.getDate() - t.completedDaysAgo);
      updates.push(`completedAt = '${completedAt.toISOString()}'`);
    }

    if (t.timeSpent) {
      updates.push(`timeSpent = ${t.timeSpent}`);
    }

    await dbRun(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, [row.id]);
  }

  // Also backdate some transitions for realistic flow data
  const transitions = await new Promise((resolve, reject) => {
    db.all('SELECT id, taskId, createdAt FROM status_transitions WHERE taskId > 2 ORDER BY id', (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });

  // Spread transitions over the last 30 days
  for (let i = 0; i < transitions.length; i++) {
    const daysBack = Math.floor(Math.random() * 28) + 1;
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    await dbRun(`UPDATE status_transitions SET createdAt = ? WHERE id = ?`, [d.toISOString(), transitions[i].id]);
  }

  db.close();

  // Verify
  console.log('\n=== Final Summary ===');
  const stats = await api('GET', '/api/stats');
  console.log(`Total: ${stats.total} | Backlog: ${stats.backlog} | Pending: ${stats.pending} | Completed: ${stats.completed}`);

  const flow = await api('GET', '/api/analytics/flow');
  console.log(`Flow (30d): ${flow.summary.totalProgressions} progressions, ${flow.summary.totalRegressions} regressions`);

  console.log('\nDone! Refresh the dashboard to see all tasks.');
}

seed().catch(err => { console.error('Error:', err); process.exit(1); });
