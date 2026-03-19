#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
DOLT_DIR="${DOLT_DIR:-$REPO_ROOT/dolt}"
MIGRATION_FILE="$REPO_ROOT/dolt/migrations/001-v2-schema.sql"

echo "=== Forge v2 Schema Migration ==="
echo ""

if [ ! -d "$DOLT_DIR/.dolt" ]; then
  echo "ERROR: Dolt database not found at $DOLT_DIR"
  echo "Run scripts/init-dolt.sh first."
  exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "ERROR: Migration file not found at $MIGRATION_FILE"
  exit 1
fi

cd "$DOLT_DIR"

# Step 1: Create a Dolt tag to preserve v0.1.0 state
echo "1. Creating Dolt tag 'v0.1.0-archive' to preserve current state..."
dolt tag v0.1.0-archive 2>/dev/null || echo "   Tag 'v0.1.0-archive' already exists, skipping."

# Step 2: Run the migration SQL
echo "2. Running migration: 001-v2-schema.sql..."
DOLT_DB="${DOLT_DATABASE:-forge}"
dolt sql -q "USE \`$DOLT_DB\`; $(cat "$MIGRATION_FILE")"

# Step 3: Commit the schema changes to Dolt
echo "3. Committing schema changes to Dolt..."
dolt add .
dolt commit -m "Archive v0.1.0 tables, create v2 schema"

# Step 4: Print confirmation
echo ""
echo "=== Migration Complete ==="
echo ""
echo "Archived tables (renamed with v1_ prefix):"
echo "  - tasks       -> v1_tasks"
echo "  - cycles      -> v1_cycles"
echo "  - stage_runs  -> v1_stage_runs"
echo "  - touch_maps  -> v1_touch_maps"
echo "  - artifacts   -> v1_artifacts"
echo "  - cycle_costs -> v1_cycle_costs"
echo "  - work_logs   -> v1_work_logs"
echo ""
echo "Preserved tables (unchanged):"
echo "  - flow_registry"
echo "  - flow_file_refs"
echo ""
echo "New v2 tables created:"
echo "  - developers"
echo "  - phase_assignments"
echo "  - file_locks"
echo "  - developer_costs"
echo ""
echo "Dolt tag 'v0.1.0-archive' points to pre-migration state."
