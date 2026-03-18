#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$REPO_ROOT/packages/templates"

usage() {
  echo "Usage: $0 --template <template-name> <target-directory>"
  echo ""
  echo "Available templates:"
  for dir in "$TEMPLATES_DIR"/*/; do
    if [ -d "$dir" ]; then
      echo "  - $(basename "$dir")"
    fi
  done
  exit 1
}

# Parse arguments
TEMPLATE=""
TARGET=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --template)
      TEMPLATE="$2"
      shift 2
      ;;
    *)
      TARGET="$1"
      shift
      ;;
  esac
done

if [ -z "$TEMPLATE" ] || [ -z "$TARGET" ]; then
  usage
fi

TEMPLATE_DIR="$TEMPLATES_DIR/$TEMPLATE"

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "ERROR: Template '$TEMPLATE' not found at $TEMPLATE_DIR"
  usage
fi

if [ ! -d "$TARGET" ]; then
  echo "ERROR: Target directory '$TARGET' does not exist."
  exit 1
fi

echo "Initializing Forge project with template: $TEMPLATE"
echo "Target: $TARGET"

# Copy template files
cp -n "$TEMPLATE_DIR/CLAUDE.md" "$TARGET/" 2>/dev/null || echo "CLAUDE.md already exists, skipping"
cp -n "$TEMPLATE_DIR/ARCHITECTURE.md" "$TARGET/" 2>/dev/null || echo "ARCHITECTURE.md already exists, skipping"
cp -n "$TEMPLATE_DIR/SECURITY.md" "$TARGET/" 2>/dev/null || echo "SECURITY.md already exists, skipping"
cp -n "$TEMPLATE_DIR/QUALITY.md" "$TARGET/" 2>/dev/null || echo "QUALITY.md already exists, skipping"
cp -n "$TEMPLATE_DIR/flow-registry.json" "$TARGET/" 2>/dev/null || echo "flow-registry.json already exists, skipping"

# Create flows directory and copy example
mkdir -p "$TARGET/.flows"
if [ -d "$TEMPLATE_DIR/flows" ]; then
  cp -rn "$TEMPLATE_DIR/flows/"* "$TARGET/.flows/" 2>/dev/null || true
fi

# Create .forge directory
mkdir -p "$TARGET/.forge/handoffs"
mkdir -p "$TARGET/.forge/librarian"
mkdir -p "$TARGET/.forge/worktrees"

# Install Git post-commit hook
if [ -d "$TARGET/.git" ]; then
  HOOK_DIR="$TARGET/.git/hooks"
  mkdir -p "$HOOK_DIR"
  cp "$REPO_ROOT/scripts/post-commit-librarian.sh" "$HOOK_DIR/post-commit"
  chmod +x "$HOOK_DIR/post-commit"
  echo "Git post-commit hook installed."
else
  echo "WARNING: $TARGET is not a Git repository. Post-commit hook not installed."
fi

echo ""
echo "========================================="
echo "Forge project initialized!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Review and customize the context files:"
echo "     - $TARGET/CLAUDE.md"
echo "     - $TARGET/ARCHITECTURE.md"
echo "     - $TARGET/SECURITY.md"
echo "     - $TARGET/QUALITY.md"
echo "  2. Create Flow documents in $TARGET/.flows/"
echo "  3. Update flow-registry.json to list your Flows"
echo "  4. Start Forge: forge start"
echo "  5. Run a cycle: forge run <path-to-prp.md>"
echo ""
