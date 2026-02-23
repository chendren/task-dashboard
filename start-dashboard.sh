#!/bin/bash
# Start the Task Dashboard
# Usage: ./start-dashboard.sh [port]
# Default port: 3000

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
