# testpilot — Agentic AI Test Suite

## Overview

**testpilot** is an **automated test suite powered by agentic AI**.
Instead of writing coded test scripts (like Selenium/Playwright), tests are defined
as **natural-language test cases** (YAML) that an AI agent executes interactively,
just like a human manual tester would.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Test Runner (runner.ts)                │
│  Reads YAML test case → orchestrates step-by-step loop     │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐       ┌──────────────────────────────┐
│   LLM Adapter       │       │   Browser Helper (browser.ts)│
│   (llm-adapter.ts)  │       │   Wraps agent-browser CLI    │
│                     │       │                              │
│  ✅ Anthropic       │       │   open, click, fill, snap,   │
│   (recommended)     │       │   screenshot, scroll, etc.   │
│                     │       │                              │
│  ⚠️  GitHub Models   │       └──────────┬───────────────────┘
│   (preview)         │                  │
│                     │                  ▼
│  🧑 Interactive      │       ┌──────────────────────────────┐
│   (human-in-loop)   │       │   agent-browser daemon       │
└─────────────────────┘       │   (Chromium via Playwright)  │
                              └──────────────────────────────┘
```

### Key files

| File                             | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `tests/*.yaml`                   | Test case definitions (natural language)            |
| `src/runner.ts`                  | Main orchestrator — reads YAML, runs steps          |
| `src/browser.ts`                 | Wrapper around `agent-browser` CLI                  |
| `src/llm-adapter.ts`             | Shared LLM types, helpers, and provider factory     |
| `src/llm-shared.ts`              | Shared types, constants, helpers (no circular deps) |
| `src/providers/anthropic.ts`     | Anthropic adapter (Claude Sonnet 4-6)               |
| `src/providers/github-models.ts` | GitHub Models adapter (GPT-4.1, preview)            |
| `src/providers/interactive.ts`   | Interactive adapter (human-in-the-loop)             |
| `src/types.ts`                   | TypeScript type definitions                         |
| `reports/`                       | Generated JSON + Markdown test reports              |
| `screenshots/`                   | Step-by-step screenshots                            |

### Tech stack

- **TypeScript** (Node.js) — runner and orchestration
- **agent-browser** — headless browser CLI for AI agents (Playwright + Chromium)
- **Anthropic API** — Claude Sonnet 4-6 for autonomous test execution (recommended)
- **GitHub Models API** — GPT-4.1 (preview, alternative provider)
- **YAML** — test case definition format

## Setup

### Prerequisites

- **Node.js** ≥ 22 (uses ESM modules)
- **npm** (comes with Node.js)
- **agent-browser** CLI — installed globally (see step 2 below)
- An **Anthropic API key** (recommended) or a **GitHub PAT** with `models` scope

### Installation

```bash
# 1. Clone the repo and install dependencies
git clone <repo-url>
cd testpilot
npm install

# 2. Install agent-browser CLI globally and its required browser (Chromium)
npm install -g agent-browser
npx playwright install chromium

# 3. Create your environment file from the example
cp .env.example .env

# 4. Edit .env — set your preferred provider and API key
```

### LLM Providers

The test suite supports multiple LLM providers. Set `MODEL_PROVIDER` in `.env` to choose:

| Provider         | `MODEL_PROVIDER` | Default model       | Notes                                        |
| ---------------- | ---------------- | ------------------- | -------------------------------------------- |
| **Anthropic** ✅ | `anthropic`      | `claude-sonnet-4-6` | Recommended — generous limits, large context |
| GitHub Models ⚠️ | `github-models`  | `openai/gpt-4.1`    | Preview service — rate limits apply          |
| Interactive 🧑   | `interactive`    | —                   | Human-in-the-loop via stdin                  |

If `MODEL_PROVIDER` is not set, the runner auto-detects based on which API keys are present
(Anthropic takes priority over GitHub Models).

#### Anthropic (recommended)

1. Go to **https://console.anthropic.com/settings/keys**
2. Create a new API key
3. Paste it into `.env` as `ANTHROPIC_API_KEY=sk-ant-…`

#### GitHub Models (preview)

> ⚠️ GitHub Models is a preview service with limitations:
> GPT-5 has a 4000-token input limit (too small for browser snapshots).
> Free tier has aggressive rate limits. Recommended model: `openai/gpt-4.1`.

1. Go to **https://github.com/settings/tokens** → Generate new token (classic)
2. Select the **`models`** scope
3. Paste it into `.env` as `GITHUB_MODELS_TOKEN=ghp_…`

> **Note:** The `.env` file is git-ignored. Never commit real tokens. The `.env.example` file
> is committed as a template.

## How to run a test

### Autonomous mode (default)

When `MODEL_PROVIDER` and the corresponding API key are set in `.env`, the runner
autonomously executes test steps — no human intervention needed.

```bash
# Run the default test (first YAML file in tests/)
npx tsx src/runner.ts

# Run all tests sequentially
npx tsx src/runner.ts --all

# Run a specific test
npx tsx src/runner.ts --test tests/TC001-todomvc-add-and-complete.yaml

# Explicitly select a provider (overrides MODEL_PROVIDER in .env)
npx tsx src/runner.ts --provider anthropic
npx tsx src/runner.ts --provider github-models
```

### Interactive mode (human-in-the-loop)

For debugging or manual exploration, use interactive mode:

```bash
npx tsx src/runner.ts --provider interactive
```

### What happens during a run

The runner will:

1. Open a headless browser and navigate to the target URL
2. For each test step, take an accessibility snapshot of the page
3. Send the snapshot + step description to the LLM (or show it to you in interactive mode)
4. Execute the browser commands returned by the LLM (click, fill, scroll, etc.)
5. Repeat until the LLM marks the step as PASS or FAIL
6. Generate a report (JSON + Markdown) in `reports/` and screenshots in `screenshots/`

## How to write a test case

Create a YAML file in `tests/`. See `tests/TC001-todomvc-add-and-complete.yaml` for the format:

```yaml
id: TC002
title: "Search for a product"
priority: P2
tags: [smoke, search]
target_url: "https://example.com"

# Optional: site-specific hints to help the AI agent navigate
site_context:
  - "The site has a search bar in the top navigation."
  - "Cookie consent banner appears on first visit — dismiss it first."

preconditions:
  - "Browser is open"

steps:
  - step: 1
    action: "Type 'laptop' in the search bar and press Enter"
    expected: "Search results page shows laptop products"
```

### `site_context` field

The `site_context` field is an optional array of hints that get injected into the
AI agent's system prompt at runtime. Use it to provide site-specific knowledge like:

- Cookie banner behavior and button labels
- Navigation structure and URL patterns
- UI patterns (carousels, accordions, modals)
- Element naming conventions

This keeps the core agent generic while allowing tests to carry domain-specific context.

## Project status

**Phase: Multi-provider autonomous execution ✅**

- [x] Test YAML schema with site_context support
- [x] Browser wrapper (agent-browser integration)
- [x] Interactive LLM adapter (human-in-the-loop)
- [x] Test runner with step-by-step execution
- [x] Report generation (JSON + Markdown)
- [x] Autonomous LLM execution (GitHub Models API — GPT-4.1)
- [x] Multi-provider architecture (Anthropic, GitHub Models, Interactive)
- [x] Anthropic adapter (Claude Sonnet 4-6)
- [x] Externalized site-specific hints into YAML test cases
- [x] agent-browser preflight check with actionable install instructions
- [x] `--all` flag to run all test cases sequentially with aggregate summary
- [x] Additional demo test cases (TC001–TC005 across TodoMVC, the-internet, books.toscrape.com, demoqa.com)
- [ ] CI/CD pipeline integration
- [ ] Assisted test case creation (record browser session → YAML)
- [ ] Web UI and SaaS deployment

## License

This project is open source and licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means you are free to use, modify, and distribute this software, but if you run a modified version
as a network service (e.g., SaaS), you **must** make the complete source code of your modified version
available to users of that service under the same license.

See [LICENSE.md](LICENSE.md) for the full license text.
