#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MISSING=0

check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ $1 not found${NC}"
    echo "  Install: $2"
    MISSING=1
    return 1
  fi
  return 0
}

check_version() {
  local cmd=$1
  local current=$2
  local required=$3
  local name=$4

  if [ "$(printf '%s\n' "$required" "$current" | sort -V | head -n1)" = "$required" ]; then
    echo -e "${GREEN}✓ $name $current (>= $required)${NC}"
  else
    echo -e "${RED}✗ $name $current (need >= $required)${NC}"
    MISSING=1
  fi
}

echo "Checking Forge dependencies..."
echo ""

# Node.js >= 22
if check_command "node" "Install Node.js 22+: https://nodejs.org/ or 'nvm install 22'"; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  check_version "node" "$NODE_VERSION" "22" "Node.js"
fi

# pnpm
if check_command "pnpm" "Install pnpm: 'corepack enable && corepack prepare pnpm@latest --activate' or 'npm install -g pnpm'"; then
  PNPM_VERSION=$(pnpm -v)
  echo -e "${GREEN}✓ pnpm $PNPM_VERSION${NC}"
fi

# Python >= 3.12
if check_command "python3" "Install Python 3.12+: https://www.python.org/downloads/ or 'brew install python@3.12'"; then
  PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
  check_version "python3" "$PY_VERSION" "3.12" "Python"
fi

# Git >= 2.5
if check_command "git" "Install Git: https://git-scm.com/downloads or 'brew install git'"; then
  GIT_VERSION=$(git --version | awk '{print $3}')
  check_version "git" "$GIT_VERSION" "2.5" "Git"
fi

# Docker
if check_command "docker" "Install Docker: https://docs.docker.com/get-docker/"; then
  DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
  echo -e "${GREEN}✓ Docker $DOCKER_VERSION${NC}"
fi

# Dolt
if check_command "dolt" "Install Dolt: 'brew install dolt' or https://docs.dolthub.com/introduction/installation"; then
  DOLT_VERSION=$(dolt version | head -1 | awk '{print $3}')
  echo -e "${GREEN}✓ Dolt $DOLT_VERSION${NC}"
fi

echo ""
if [ $MISSING -eq 1 ]; then
  echo -e "${RED}Some dependencies are missing or outdated. Install them and re-run.${NC}"
  exit 1
else
  echo -e "${GREEN}All dependencies satisfied!${NC}"
fi
