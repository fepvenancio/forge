#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
DOLT_DIR="$REPO_ROOT/dolt"
DOLT_DATA_DIR="$DOLT_DIR/.dolt"
SCHEMA_FILE="$DOLT_DIR/schema.sql"
PID_FILE="$DOLT_DIR/.dolt-server.pid"

DOLT_HOST="${DOLT_HOST:-0.0.0.0}"
DOLT_PORT="${DOLT_PORT:-3306}"
DOLT_USER="${DOLT_USER:-root}"

echo "Initializing Forge Dolt database..."

# Create dolt directory if needed
mkdir -p "$DOLT_DIR"
cd "$DOLT_DIR"

# Initialize Dolt if not already done
if [ ! -d "$DOLT_DATA_DIR" ]; then
  echo "Running dolt init..."
  dolt init --name "forge" --email "forge@local"
  echo "Dolt initialized."
else
  echo "Dolt already initialized."
fi

# Check if Dolt server is already running
if [ -f "$PID_FILE" ]; then
  EXISTING_PID=$(cat "$PID_FILE")
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Dolt server already running (PID $EXISTING_PID). Skipping restart."
    # Still run schema in case it's been updated
    if [ -f "$SCHEMA_FILE" ]; then
      echo "Applying schema..."
      dolt sql < "$SCHEMA_FILE" 2>/dev/null || true
      echo "Schema applied."
    fi
    exit 0
  else
    echo "Stale PID file found. Removing."
    rm -f "$PID_FILE"
  fi
fi

# Start Dolt SQL server
echo "Starting Dolt SQL server on $DOLT_HOST:$DOLT_PORT..."
dolt sql-server --host "$DOLT_HOST" --port "$DOLT_PORT" --user "$DOLT_USER" &
DOLT_PID=$!
echo "$DOLT_PID" > "$PID_FILE"

# Robust readiness poll
MAX_ATTEMPTS=60
ATTEMPT=0
until dolt sql -q "SELECT 1" > /dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "ERROR: Dolt did not start after ${MAX_ATTEMPTS} attempts. Check dolt sql-server logs."
    exit 1
  fi
  echo "Waiting for Dolt... attempt $ATTEMPT/$MAX_ATTEMPTS"
  sleep 2
done

echo "Dolt server is ready (PID $DOLT_PID)."

# Run schema
if [ -f "$SCHEMA_FILE" ]; then
  echo "Applying schema from $SCHEMA_FILE..."
  dolt sql < "$SCHEMA_FILE"
  echo "Schema applied successfully."
else
  echo "WARNING: Schema file not found at $SCHEMA_FILE"
fi

echo "Forge Dolt database initialized."
