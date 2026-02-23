#!/bin/bash
# Check and send reminders - runs every minute from cron
# Uses full paths since cron has limited PATH

REMINDERS_FILE="$HOME/.openclaw/workspace/reminders.json"
USER_ID="REDACTED_TELEGRAM_USER_ID"
OPENCLAW="/home/chad/.npm-global/bin/openclaw"

if [ ! -f "$REMINDERS_FILE" ]; then
  exit 0
fi

# Extract and send all pending reminders
grep -o '"subject"[[:space:]]*:[[:space:]]*"[^"]*"' "$REMINDERS_FILE" | \
sed 's/.*"\([^"]*\)".*/\1/' | while read -r subject; do
  if [ ! -z "$subject" ]; then
    $OPENCLAW message send \
      --channel telegram \
      --target "$USER_ID" \
      --message "⏰ Reminder: $subject" 2>/dev/null
  fi
done
