#!/bin/bash
# Reminder daemon - runs continuously, checks reminders every 30 seconds
# Start with: nohup ./reminder-daemon.sh > /tmp/reminder-daemon.log 2>&1 &

REMINDERS_FILE="$HOME/.openclaw/workspace/reminders.json"
USER_ID="REDACTED_TELEGRAM_USER_ID"

while true; do
  if [ -f "$REMINDERS_FILE" ]; then
    # Extract all pending reminders and send those that are due
    grep -o '"subject"[[:space:]]*:[[:space:]]*"[^"]*"' "$REMINDERS_FILE" | \
    sed 's/.*"\([^"]*\)".*/\1/' | while read -r subject; do
      if [ ! -z "$subject" ]; then
        openclaw message send \
          --channel telegram \
          --target "$USER_ID" \
          --message "⏰ Reminder: $subject" 2>/dev/null
      fi
    done
  fi
  
  sleep 30
done
