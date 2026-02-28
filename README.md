# testpilot — AI-Powered Test Runner

**testpilot** runs manual-style test cases against any web application using AI.
Write your tests in plain English (YAML), pull the Docker image, and run them —
no Selenium scripts, no CSS selectors, no test framework boilerplate.

```yaml
# tests/TC001-login.yaml
id: TC001
title: "Valid login"
target_url: "https://the-internet.herokuapp.com/login"
steps:
  - step: 1
    action: "Enter 'tomsmith' in the Username field"
    expected: "The username field contains 'tomsmith'"
  - step: 2
    action: "Enter 'SuperSecretPassword!' in the Password field and click Login"
    expected: "The page navigates to /secure with a success message"
```

```bash
docker run --rm \
  -v ./tests:/app/tests \
  -v ./reports:/app/reports \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  ghcr.io/samufl/testpilot --test tests/TC001-login.yaml
```

That's it. The AI agent opens a browser, reads the page, and executes each step
like a human tester would — then writes a pass/fail report.

---

## Quick Start (Docker)

### 1. Get an API key

testpilot uses an LLM to understand web pages and decide what to click/type.
You need an **Anthropic API key** (recommended):

→ **https://console.anthropic.com/settings/keys** — create a key, copy it.

### 2. Write a test case

Create a YAML file anywhere on your machine (e.g., `tests/my-test.yaml`):

```yaml
id: TC001
title: "Search for a product"
priority: P2
tags: [smoke]
target_url: "https://books.toscrape.com"

# Optional hints to help the AI navigate the site
site_context:
  - "The site shows a list of books with links to detail pages."

preconditions:
  - "Browser is open"

steps:
  - step: 1
    action: "Click on the first book title"
    expected: "The book detail page opens showing price and description"
  - step: 2
    action: "Click the 'Add to basket' button"
    expected: "The basket count increases to 1"
```

**Steps are plain English.** No selectors, no code. The AI reads the page's
accessibility tree and figures out which elements to interact with.

### 3. Run with Docker

```bash
# Run a single test
docker run --rm \
  -v ./tests:/app/tests \
  -v ./reports:/app/reports \
  -v ./screenshots:/app/screenshots \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  ghcr.io/samufl/testpilot --test tests/my-test.yaml

# Run all tests in a directory
docker run --rm \
  -v ./tests:/app/tests \
  -v ./reports:/app/reports \
  -v ./screenshots:/app/screenshots \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  ghcr.io/samufl/testpilot --all
```

Reports (JSON + Markdown) are written to `reports/`, screenshots to `screenshots/`.

---

## Writing Test Cases

### YAML Schema

| Field            | Required | Description                                          |
| ---------------- | -------- | ---------------------------------------------------- |
| `id`             | yes      | Unique test ID (e.g., `TC001`)                       |
| `title`          | yes      | Human-readable test title                            |
| `priority`       | no       | `P1` – `P4`                                         |
| `tags`           | no       | Array of tags for filtering                          |
| `target_url`     | yes      | The URL to open at the start of the test             |
| `site_context`   | no       | Array of hints injected into the AI's system prompt  |
| `preconditions`  | no       | Array of preconditions (for documentation)           |
| `steps`          | yes      | Array of step objects                                |

### Steps

Each step has:

- **`step`** — step number (integer)
- **`action`** — what to do, in plain English
- **`expected`** — what should happen, in plain English

```yaml
steps:
  - step: 1
    action: "Type 'laptop' in the search bar and press Enter"
    expected: "Search results page shows laptop products"
```

Write steps the way you'd write them for a human tester. The AI discovers UI
elements at runtime via accessibility snapshots — you never need to specify
selectors.

### `site_context` — Teaching the AI About Your Site

The `site_context` field lets you give the AI site-specific knowledge:

```yaml
site_context:
  - "A cookie consent banner appears on first visit — click 'Accept all' to dismiss."
  - "The main navigation is in a sidebar on the left."
  - "After login, the dashboard takes 2-3 seconds to load."
```

This keeps the runner generic while making each test self-contained.

### Example Test Cases

The repo includes demo tests in `tests/`:

| File | Target Site | What It Tests |
| ---- | ----------- | ------------- |
| `TC001-todomvc-add-and-complete.yaml` | TodoMVC | Add and complete a todo item |
| `TC002-the-internet-valid-login.yaml` | The Internet | Valid login flow |
| `TC003-the-internet-invalid-login.yaml` | The Internet | Invalid login error message |
| `TC004-books-toscrape-browse-and-detail.yaml` | Books to Scrape | Browse catalog and view details |
| `TC005-demoqa-practice-form.yaml` | DemoQA | Fill out a complex form |

---

## LLM Providers

| Provider         | `MODEL_PROVIDER` | Default Model        | Notes                        |
| ---------------- | ---------------- | -------------------- | ---------------------------- |
| **Anthropic** ✅ | `anthropic`      | `claude-sonnet-4-6`  | Recommended — large context  |
| GitHub Models ⚠️ | `github-models`  | `openai/gpt-4.1`     | Preview — rate limits apply  |
| Interactive 🧑   | `interactive`    | —                    | Human-in-the-loop via stdin  |

Pass the API key as an environment variable:

```bash
# Anthropic (recommended)
-e ANTHROPIC_API_KEY=sk-ant-...

# GitHub Models (alternative)
-e GITHUB_MODELS_TOKEN=ghp_...

# Override the provider explicitly
-e MODEL_PROVIDER=anthropic
```

---

## Local Development Setup

If you want to contribute or run testpilot without Docker:

### Prerequisites

- **Node.js** ≥ 22
- **agent-browser** CLI
- An LLM API key

### Installation

```bash
git clone https://github.com/SamuFL/testpilot.git
cd testpilot
npm install

# Install agent-browser and Chromium
npm install -g agent-browser
npx playwright install chromium

# Configure your API key
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY=sk-ant-...
```

### Running locally

```bash
# Run a specific test
npx tsx src/runner.ts --test tests/TC001-todomvc-add-and-complete.yaml

# Run all tests
npx tsx src/runner.ts --all

# Interactive mode (human-in-the-loop, for debugging)
npx tsx src/runner.ts --provider interactive

# Type-check
npm run typecheck
```

### Building the Docker image locally

```bash
docker build -t testpilot .

docker run --rm \
  -v ./tests:/app/tests \
  -v ./reports:/app/reports \
  -v ./screenshots:/app/screenshots \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  testpilot --test tests/TC001-todomvc-add-and-complete.yaml
```

---

## Architecture

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
│  ⚠️  GitHub Models   │       │   screenshot, scroll, etc.   │
│  🧑 Interactive      │       └──────────┬───────────────────┘
└─────────────────────┘                  │
                                         ▼
                              ┌──────────────────────────────┐
                              │   agent-browser daemon       │
                              │   (Chromium via Playwright)  │
                              └──────────────────────────────┘
```

### How a test run works

1. The runner reads a YAML test case and opens the target URL
2. For each step, it takes an **accessibility snapshot** of the page
3. The snapshot + step instructions are sent to the LLM
4. The LLM decides which `agent-browser` commands to execute (click, fill, etc.)
5. The runner executes the commands and takes a new snapshot
6. The LLM verifies the expected result against the snapshot
7. Steps repeat until pass or fail — then a report is generated

### Key files

| File | Purpose |
| ---- | ------- |
| `src/runner.ts` | Main orchestrator — reads YAML, runs steps, generates reports |
| `src/browser.ts` | Wrapper around `agent-browser` CLI |
| `src/llm-adapter.ts` | LLM provider factory and shared types |
| `src/providers/*.ts` | Individual LLM provider implementations |
| `src/types.ts` | TypeScript type definitions |

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

| Job | Trigger | What it does |
| --- | ------- | ------------ |
| **Type-check** | always | `tsc --noEmit` |
| **Test suite** | `RUN_BROWSER_TESTS = true` | Runs all tests, uploads reports as artifacts |
| **Docker** | push to `main` | Builds and pushes image to `ghcr.io/samufl/testpilot` |

### GitHub repo setup (one-time)

1. **Secret:** `ANTHROPIC_API_KEY` — your Anthropic API key
2. **Variable:** `RUN_BROWSER_TESTS` = `true` — enables the browser test job

The Docker image is published automatically on every push to `main` — no setup needed
(GitHub Actions has built-in `GITHUB_TOKEN` permissions for GHCR).

---

## License

[AGPL-3.0-or-later](LICENSE.md)
