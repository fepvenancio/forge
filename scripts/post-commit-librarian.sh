#!/bin/bash
# Installed by init-project.sh into .git/hooks/post-commit
# Triggers Librarian for local development workflows
CHANGED_FILES=$(git diff-tree --no-commit-id -r --name-only HEAD)
curl -s -X POST http://localhost:3001/local-commit \
  -H "Content-Type: application/json" \
  -d "{\"files\": $(echo "$CHANGED_FILES" | jq -R . | jq -s .), \"sha\": \"$(git rev-parse HEAD)\"}"
