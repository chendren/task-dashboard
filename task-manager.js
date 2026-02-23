#!/usr/bin/env node
/**
 * Task Manager - Telegram Command Handler
 * Handles all task operations via Telegram
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { execSync } = require('child_process');

const dbPath = path.join(process.env.HOME, '.openclaw/workspace/tasks.db');
const userId = 'REDACTED_TELEGRAM_USER_ID';

class TaskManager {
  constructor() {
    this.db = new sqlite3.Database(dbPath);
  }

  /**
   * Add a new task
   * Format: add <name> [due_date] [priority] [category]
   */
  addTask(params) {
    const [name, dueDate, priority = 'medium', category = 'general'] = params;
    
    if (!name) {
      return this.sendMessage('❌ Task name required');
    }

    const self = this;
    return new Promise((resolve) => {
      this.db.run(
        'INSERT INTO tasks (name, dueDate, priority, category) VALUES (?, ?, ?, ?)',
        [name, dueDate || null, priority, category],
        function(err) {
          if (err) {
            resolve(self.sendMessage('❌ Error creating task: ' + err.message));
          } else {
            const taskId = this.lastID;
            resolve(self.sendMessage(`✅ Task created (ID: ${taskId})\n📝 ${name}`));
          }
        }
      );
    });
  }

  /**
   * List tasks with optional filters
   * Format: list [status] [category] [priority]
   */
  listTasks(filters = {}) {
    let query = 'SELECT id, name, dueDate, priority, category, status FROM tasks WHERE status != "archived"';
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters.priority) {
      query += ' AND priority = ?';
      params.push(filters.priority);
    }

    query += ' ORDER BY priority DESC, dueDate ASC';

    const self = this;
    return new Promise((resolve) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          resolve(self.sendMessage('❌ Error listing tasks'));
          return;
        }

        if (!rows || rows.length === 0) {
          resolve(self.sendMessage('📭 No tasks found'));
          return;
        }

        let message = '📋 **Your Tasks**\n\n';
        rows.forEach(row => {
          const icon = row.status === 'completed' ? '✅' : '○';
          const priority = row.priority === 'high' ? '🔴' : row.priority === 'medium' ? '🟡' : '🟢';
          const due = row.dueDate ? ` (Due: ${row.dueDate})` : '';
          message += `${icon} [${row.id}] ${priority} ${row.name}${due}\n`;
          message += `    Category: ${row.category}\n`;
        });

        resolve(self.sendMessage(message));
      });
    });
  }

  /**
   * Mark task as done
   */
  completeTask(taskId) {
    if (!taskId) {
      return this.sendMessage('❌ Task ID required');
    }

    const self = this;
    return new Promise((resolve) => {
      this.db.run(
        'UPDATE tasks SET status = ?, completedAt = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', taskId],
        (err) => {
          if (err) {
            resolve(self.sendMessage('❌ Error completing task'));
          } else {
            resolve(self.sendMessage(`✅ Task ${taskId} marked complete!`));
          }
        }
      );
    });
  }

  /**
   * Delete a task
   */
  deleteTask(taskId) {
    if (!taskId) {
      return this.sendMessage('❌ Task ID required');
    }

    const self = this;
    return new Promise((resolve) => {
      this.db.run(
        'DELETE FROM tasks WHERE id = ?',
        [taskId],
        (err) => {
          if (err) {
            resolve(self.sendMessage('❌ Error deleting task'));
          } else {
            resolve(self.sendMessage(`🗑️ Task ${taskId} deleted`));
          }
        }
      );
    });
  }

  /**
   * Get task details
   */
  getTask(taskId) {
    if (!taskId) {
      return this.sendMessage('❌ Task ID required');
    }

    const self = this;
    return new Promise((resolve) => {
      this.db.get(
        'SELECT * FROM tasks WHERE id = ?',
        [taskId],
        (err, row) => {
          if (err || !row) {
            resolve(self.sendMessage('❌ Task not found'));
            return;
          }

          let message = `📌 **Task ${taskId}**\n\n`;
          message += `Name: ${row.name}\n`;
          message += `Status: ${row.status}\n`;
          message += `Priority: ${row.priority}\n`;
          message += `Category: ${row.category}\n`;
          if (row.dueDate) message += `Due: ${row.dueDate}\n`;
          if (row.description) message += `Notes: ${row.description}\n`;
          message += `Created: ${row.createdAt}\n`;

          resolve(self.sendMessage(message));
        }
      );
    });
  }

  /**
   * Send message via Telegram
   */
  sendMessage(message) {
    try {
      const cmd = `openclaw message send --channel telegram --target ${userId} --message "${message.replace(/"/g, '\\"')}"`;
      execSync(cmd, { stdio: 'pipe' });
      return Promise.resolve();
    } catch (err) {
      console.error('Error sending message:', err.message);
      return Promise.reject(err);
    }
  }

  /**
   * Show help
   */
  showHelp() {
    const help = `
🤖 **Task Manager Commands**

📝 **Create & Manage**
/task add <name> [due] [priority] [category]
/task list [status] [category] [priority]
/task done <id>
/task delete <id>
/task view <id>

🏷️ **Categories**
/cat add <name>
/cat list

⏱️ **Time Tracking**
/task time start <id>
/task time stop <id>
/task time log <id>

🔄 **Recurring**
/task recurring <id> <daily|weekly|monthly>

📊 **Filters**
/task pending
/task completed
/task high
/task today
/task week

💡 **Help**
/task help
    `;
    return this.sendMessage(help);
  }

  close() {
    this.db.close();
  }
}

// Main execution
async function main() {
  const manager = new TaskManager();
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];
  const params = args.slice(2);

  try {
    switch (command) {
      case 'add':
        await manager.addTask(params);
        break;
      case 'list':
        await manager.listTasks();
        break;
      case 'done':
        await manager.completeTask(subcommand);
        break;
      case 'delete':
        await manager.deleteTask(subcommand);
        break;
      case 'view':
        await manager.getTask(subcommand);
        break;
      case 'help':
        await manager.showHelp();
        break;
      default:
        await manager.showHelp();
    }
  } catch (err) {
    console.error('Command error:', err.message);
  }

  manager.close();
}

main();
