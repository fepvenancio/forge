FROM node:22.14-slim AS base

# Install Python 3.12
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-venv \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r forge && useradd -r -g forge -m forge

# Context store mount point (read-only at runtime)
RUN mkdir -p /forge-context && chown forge:forge /forge-context

USER forge

# Default command — overridden by orchestrator
CMD ["bash"]
