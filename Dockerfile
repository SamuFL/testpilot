# ─────────────────────────────────────────────────────────────────────────────
# testpilot — Docker image for the AI-powered test runner
#
# This image packages the testpilot runner with agent-browser and Playwright
# Chromium. It does NOT contain test case YAML files — mount your own via
# Docker volumes.
#
# Usage:
#   docker build -t testpilot .
#   docker run --rm \
#     -v ./tests:/app/tests \
#     -v ./reports:/app/reports \
#     -v ./screenshots:/app/screenshots \
#     -e ANTHROPIC_API_KEY=sk-ant-... \
#     testpilot --test tests/TC001-my-test.yaml
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-slim

# Playwright / Chromium system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install agent-browser globally
RUN npm install -g agent-browser

# Install Playwright Chromium browser binary
RUN npx playwright install chromium

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source code (tests/, reports/, screenshots/ excluded via .dockerignore)
COPY src/ ./src/
COPY tsconfig.json ./

# Create mount points for user data (empty directories)
RUN mkdir -p tests reports screenshots

# The entrypoint is the test runner — all CLI flags are passed through
ENTRYPOINT ["npx", "tsx", "src/runner.ts"]
