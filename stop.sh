#!/bin/bash

echo ""
echo "🔍 Checking for running processes..."
echo ""

SERVER_PORT=${SERVER_PORT:-3001}
CLIENT_PORT=${CLIENT_PORT:-3000}
FOUND=0

# Function to kill process on a port
kill_port() {
    local port=$1
    local name=$2
    
    echo "Checking port $port ($name)..."
    
    # Try lsof first
    if command -v lsof &> /dev/null; then
        PIDS=$(lsof -ti:$port 2>/dev/null)
        if [ -n "$PIDS" ]; then
            for PID in $PIDS; do
                echo "🛑 Killing process $PID on port $port..."
                kill -9 $PID 2>/dev/null
                FOUND=1
            done
        fi
    # Fallback to fuser
    elif command -v fuser &> /dev/null; then
        PIDS=$(fuser $port/tcp 2>/dev/null)
        if [ -n "$PIDS" ]; then
            for PID in $PIDS; do
                echo "🛑 Killing process $PID on port $port..."
                kill -9 $PID 2>/dev/null
                FOUND=1
            done
        fi
    else
        echo "⚠️  Neither lsof nor fuser found. Cannot check port $port."
    fi
}

# Kill processes on both ports
kill_port $SERVER_PORT "Backend Server"
kill_port $CLIENT_PORT "Frontend Client"

echo ""
if [ $FOUND -eq 1 ]; then
    echo "✅ All processes stopped successfully!"
else
    echo "ℹ️  No processes were running."
fi
echo ""
