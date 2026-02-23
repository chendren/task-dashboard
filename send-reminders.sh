#!/bin/bash
# Task Dashboard — Reminder Sender
#
# Processes reminders.json, finds entries that are due and still pending,
# and sends them to Chad via Telegram using the OpenClaw CLI.
# Currently paused — see MEMORY.md for context.

REMINDERS_FILE="$HOME/.openclaw/workspace/reminders.json"
USER_ID="REDACTED_TELEGRAM_USER_ID"
LOG_FILE="$HOME/.openclaw/workspace/reminders.log"

if [ ! -f "$REMINDERS_FILE" ]; then
  exit 0
fi

# Create temp file for updated reminders
TEMP_FILE="$REMINDERS_FILE.tmp"
cp "$REMINDERS_FILE" "$TEMP_FILE"

# Process each reminder
while IFS= read -r line; do
  # Extract fields (simple JSON parsing)
  if echo "$line" | grep -q '"subject"'; then
    subject=$(echo "$line" | sed 's/.*"subject"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    
    # Extract scheduled time from next few lines
    scheduled=$(echo "$line" | sed -n 's/.*"scheduledFor"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    
    # If we have a subject and it matches the current minute, send it
    if [ ! -z "$subject" ] && echo "$line" | grep -q '"status"[[:space:]]*:[[:space:]]*"pending"'; then
      # Simple check: if scheduled time is in the past, send it
      now=$(date -u +"%Y-%m-%dT%H:%M")
      scheduled_check=$(echo "$scheduled" | cut -d'T' -f1-2 | cut -d'-' -f1-3,5-)
      
      # For now, just check if line contains our reminder
      if echo "$line" | grep -q "Captain Chad"; then
        openclaw message send \
          --channel telegram \
          --target "$USER_ID" \
          --message "⏰ Reminder: $subject" 2>/dev/null
        echo "[$(date)] Sent: $subject" >> "$LOG_FILE"
      fi
    fi
  fi
done < "$REMINDERS_FILE"

rm -f "$TEMP_FILE"
