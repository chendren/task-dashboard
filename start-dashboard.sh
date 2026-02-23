#!/bin/bash
# Task Dashboard — Quick Start Script
#
# Starts the Express server that serves the Trello-style board.
# Pass a port number as the first argument, or it defaults to 3000.
#
# Usage:
#   ./start-dashboard.sh        → http://localhost:3000
#   ./start-dashboard.sh 8080   → http://localhost:8080

PORT=${1:-3000}

echo "🚀 Starting Task Dashboard..."
echo ""
echo "📊 Dashboard: http://localhost:$PORT"
echo "📡 API: http://localhost:$PORT/api/tasks"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd ~/.openclaw/workspace
PORT=$PORT node server.js
