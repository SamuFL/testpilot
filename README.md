# testpilot — AI-Powered Test Runner# testpilot — Agentic AI Test Suite



**testpilot** runs manual-style test cases against any web application using AI.## Overview

Write your tests in plain English (YAML), pull the Docker image, and run them —

no Selenium scripts, no CSS selectors, no test framework boilerplate.**testpilot** is an **automated test suite powered by agentic AI**.

Instead of writing coded test scripts (like Selenium/Playwright), tests are defined

```yamlas **natural-language test cases** (YAML) that an AI agent executes interactively,

# tests/TC001-login.yamljust like a human manual tester would.

id: TC001

title: "Valid login"### Architecture

target_url: "https://the-internet.herokuapp.com/login"

steps:```

  - step: 1┌─────────────────────────────────────────────────────────────┐

    action: "Enter 'tomsmith' in the Username field"│                      Test Runner (runner.ts)                │

    expected: "The username field contains 'tomsmith'"│  Reads YAML test case → orchestrates step-by-step loop     │

  - step: 2└──────────┬──────────────────────────────┬───────────────────┘

    action: "Enter 'SuperSecretPassword!' in the Password field and click Login"           │                              │

    expected: "The page navigates to /secure with a success message"           ▼                              ▼

```┌─────────────────────┐       ┌──────────────────────────────┐

│   LLM Adapter       │       │   Browser Helper (browser.ts)│

```bash│   (llm-adapter.ts)  │       │   Wraps agent-browser CLI    │

docker run --rm \│                     │       │                              │

  -v ./tests:/app/tests \│  ✅ Anthropic       │       │   open, click, fill, snap,   │

  -v ./reports:/app/reports \│   (recommended)     │       │   screenshot, scroll, etc.   │

  -e ANTHROPIC_API_KEY=sk-ant-... \│                     │       │                              │

  ghcr.io/samufl/testpilot --test tests/TC001-login.yaml│  ⚠️  GitHub Models   │       └──────────┬───────────────────┘

```│   (preview)         │                  │

│                     │                  ▼

That's it. The AI agent opens a browser, reads the page, and executes each step│  🧑 Interactive      │       ┌──────────────────────────────┐

like a human tester would — then writes a pass/fail report.│   (human-in-loop)   │       │   agent-browser daemon       │

└─────────────────────┘       │   (Chromium via Playwright)  │

---                              └──────────────────────────────┘

```

## Quick Start (Docker)

### Key files

### 1. Get an API key

| File                             | Purpose                                             |

testpilot uses an LLM to understand web pages and decide what to click/type.| -------------------------------- | --------------------------------------------------- |

You need an **Anthropic API key** (recommended):| `tests/*.yaml`                   | Test case definitions (natural language)            |

| `src/runner.ts`                  | Main orchestrator — reads YAML, runs steps          |

→ **https://console.anthropic.com/settings/keys** — create a key, copy it.| `src/browser.ts`                 | Wrapper around `agent-browser` CLI                  |

| `src/llm-adapter.ts`             | Shared LLM types, helpers, and provider factory     |

### 2. Write a test case| `src/llm-shared.ts`              | Shared types, constants, helpers (no circular deps) |

| `src/providers/anthropic.ts`     | Anthropic adapter (Claude Sonnet 4-6)               |

Create a YAML file anywhere on your machine (e.g., `tests/my-test.yaml`):| `src/providers/github-models.ts` | GitHub Models adapter (GPT-4.1, preview)            |

| `src/providers/interactive.ts`   | Interactive adapter (human-in-the-loop)             |

```yaml| `src/types.ts`                   | TypeScript type definitions                         |

id: TC001| `reports/`                       | Generated JSON + Markdown test reports              |

title: "Search for a product"| `screenshots/`                   | Step-by-step screenshots                            |

priority: P2

tags: [smoke]### Tech stack

target_url: "https://books.toscrape.com"

- **TypeScript** (Node.js) — runner and orchestration

# Optional hints to help the AI navigate the site- **agent-browser** — headless browser CLI for AI agents (Playwright + Chromium)

site_context:- **Anthropic API** — Claude Sonnet 4-6 for autonomous test execution (recommended)

  - "The site shows a list of books with links to detail pages."- **GitHub Models API** — GPT-4.1 (preview, alternative provider)

- **YAML** — test case definition format

preconditions:

  - "Browser is open"## Setup



steps:### Prerequisites

  - step: 1

    action: "Click on the first book title"- **Node.js** ≥ 22 (uses ESM modules)

    expected: "The book detail page opens showing price and description"- **npm** (comes with Node.js)

  - step: 2- **agent-browser** CLI — installed globally (see step 2 below)

    action: "Click the 'Add to basket' button"- An **Anthropic API key** (recommended) or a **GitHub PAT** with `models` scope

    expected: "The basket count increases to 1"

```### Installation



**Steps are plain English.** No selectors, no code. The AI reads the page's```bash

accessibility tree and figures out which elements to interact with.# 1. Clone the repo and install dependencies

git clone <repo-url>

### 3. Run with Dockercd testpilot

npm install

```bash

# Run a single test# 2. Install agent-browser CLI globally and its required browser (Chromium)

docker run --rm \npm install -g agent-browser

  -v ./tests:/app/tests \npx playwright install chromium

  -v ./reports:/app/reports \

  -v ./screenshots:/app/screenshots \# 3. Create your environment file from the example

  -e ANTHROPIC_API_KEY=sk-ant-... \cp .env.example .env

  ghcr.io/samufl/testpilot --test tests/my-test.yaml

# 4. Edit .env — set your preferred provider and API key

# Run all tests in a directory```

docker run --rm \

  -v ./tests:/app/tests \### LLM Providers

  -v ./reports:/app/reports \

  -v ./screenshots:/app/screenshots \The test suite supports multiple LLM providers. Set `MODEL_PROVIDER` in `.env` to choose:

  -e ANTHROPIC_API_KEY=sk-ant-... \

  ghcr.io/samufl/testpilot --all| Provider         | `MODEL_PROVIDER` | Default model       | Notes                                        |

```| ---------------- | ---------------- | ------------------- | -------------------------------------------- |

| **Anthropic** ✅ | `anthropic`      | `claude-sonnet-4-6` | Recommended — generous limits, large context |

Reports (JSON + Markdown) are written to `reports/`, screenshots to `screenshots/`.| GitHub Models ⚠️ | `github-models`  | `openai/gpt-4.1`    | Preview service — rate limits apply          |

| Interactive 🧑   | `interactive`    | —                   | Human-in-the-loop via stdin                  |

---

If `MODEL_PROVIDER` is not set, the runner auto-detects based on which API keys are present

## Writing Test Cases(Anthropic takes priority over GitHub Models).



### YAML Schema#### Anthropic (recommended)



| Field            | Required | Description                                          |1. Go to **https://console.anthropic.com/settings/keys**

| ---------------- | -------- | ---------------------------------------------------- |2. Create a new API key

| `id`             | yes      | Unique test ID (e.g., `TC001`)                       |3. Paste it into `.env` as `ANTHROPIC_API_KEY=sk-ant-…`

| `title`          | yes      | Human-readable test title                            |

| `priority`       | no       | `P1` – `P4`                                         |#### GitHub Models (preview)

| `tags`           | no       | Array of tags for filtering                          |

| `target_url`     | yes      | The URL to open at the start of the test             |> ⚠️ GitHub Models is a preview service with limitations:

| `site_context`   | no       | Array of hints injected into the AI's system prompt  |> GPT-5 has a 4000-token input limit (too small for browser snapshots).

| `preconditions`  | no       | Array of preconditions (for documentation)           |> Free tier has aggressive rate limits. Recommended model: `openai/gpt-4.1`.

| `steps`          | yes      | Array of step objects                                |

1. Go to **https://github.com/settings/tokens** → Generate new token (classic)

### Steps2. Select the **`models`** scope

3. Paste it into `.env` as `GITHUB_MODELS_TOKEN=ghp_…`

Each step has:

> **Note:** The `.env` file is git-ignored. Never commit real tokens. The `.env.example` file

- **`step`** — step number (integer)> is committed as a template.

- **`action`** — what to do, in plain English

- **`expected`** — what should happen, in plain English## How to run a test



```yaml### Autonomous mode (default)

steps:

  - step: 1When `MODEL_PROVIDER` and the corresponding API key are set in `.env`, the runner

    action: "Type 'laptop' in the search bar and press Enter"autonomously executes test steps — no human intervention needed.

    expected: "Search results page shows laptop products"

``````bash

# Run the default test (first YAML file in tests/)

Write steps the way you'd write them for a human tester. The AI discovers UInpx tsx src/runner.ts

elements at runtime via accessibility snapshots — you never need to specify

selectors.# Run all tests sequentially

npx tsx src/runner.ts --all

### `site_context` — Teaching the AI About Your Site

# Run a specific test

The `site_context` field lets you give the AI site-specific knowledge:npx tsx src/runner.ts --test tests/TC001-todomvc-add-and-complete.yaml



```yaml# Explicitly select a provider (overrides MODEL_PROVIDER in .env)

site_context:npx tsx src/runner.ts --provider anthropic

  - "A cookie consent banner appears on first visit — click 'Accept all' to dismiss."npx tsx src/runner.ts --provider github-models

  - "The main navigation is in a sidebar on the left."```

  - "After login, the dashboard takes 2-3 seconds to load."

```### Interactive mode (human-in-the-loop)



This keeps the runner generic while making each test self-contained.For debugging or manual exploration, use interactive mode:



### Example Test Cases```bash

npx tsx src/runner.ts --provider interactive

The repo includes demo tests in `tests/`:```



| File | Target Site | What It Tests |### What happens during a run

| ---- | ----------- | ------------- |

| `TC001-todomvc-add-and-complete.yaml` | TodoMVC | Add and complete a todo item |The runner will:

| `TC002-the-internet-valid-login.yaml` | The Internet | Valid login flow |

| `TC003-the-internet-invalid-login.yaml` | The Internet | Invalid login error message |1. Open a headless browser and navigate to the target URL

| `TC004-books-toscrape-browse-and-detail.yaml` | Books to Scrape | Browse catalog and view details |2. For each test step, take an accessibility snapshot of the page

| `TC005-demoqa-practice-form.yaml` | DemoQA | Fill out a complex form |3. Send the snapshot + step description to the LLM (or show it to you in interactive mode)

4. Execute the browser commands returned by the LLM (click, fill, scroll, etc.)

---5. Repeat until the LLM marks the step as PASS or FAIL

6. Generate a report (JSON + Markdown) in `reports/` and screenshots in `screenshots/`

## LLM Providers

### Running with Docker

| Provider         | `MODEL_PROVIDER` | Default Model        | Notes                        |

| ---------------- | ---------------- | -------------------- | ---------------------------- |The testpilot Docker image packages the runner with agent-browser and Chromium — no

| **Anthropic** ✅ | `anthropic`      | `claude-sonnet-4-6`  | Recommended — large context  |local installation of either is needed. The image does **not** contain test cases;

| GitHub Models ⚠️ | `github-models`  | `openai/gpt-4.1`     | Preview — rate limits apply  |mount your own via Docker volumes.

| Interactive 🧑   | `interactive`    | —                    | Human-in-the-loop via stdin  |

```bash

Pass the API key as an environment variable:# Build the image

docker build -t testpilot .

```bash

# Anthropic (recommended)# Run a single test

-e ANTHROPIC_API_KEY=sk-ant-...docker run --rm \

  -v ./tests:/app/tests \

# GitHub Models (alternative)  -v ./reports:/app/reports \

-e GITHUB_MODELS_TOKEN=ghp_...  -v ./screenshots:/app/screenshots \

  -e ANTHROPIC_API_KEY=sk-ant-... \

# Override the provider explicitly  testpilot --test tests/TC001-todomvc-add-and-complete.yaml

-e MODEL_PROVIDER=anthropic

```# Run all tests in the mounted directory

docker run --rm \

---  -v ./tests:/app/tests \

  -v ./reports:/app/reports \

## Local Development Setup  -v ./screenshots:/app/screenshots \

  -e ANTHROPIC_API_KEY=sk-ant-... \

If you want to contribute or run testpilot without Docker:  testpilot --all

```

### Prerequisites

Reports and screenshots are written back to the mounted host directories.

- **Node.js** ≥ 22

- **agent-browser** CLI## CI/CD

- An LLM API key

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`.

### Installation

### Jobs

```bash

git clone https://github.com/SamuFL/testpilot.git| Job | Trigger | What it does |

cd testpilot|-----|---------|--------------|

npm install| **Type-check** | always | Runs `npm run typecheck` (`tsc --noEmit`) |

| **Run test suite** | only when `RUN_BROWSER_TESTS = true` | Installs `agent-browser` + Chromium, runs all tests, uploads reports and screenshots as artifacts |

# Install agent-browser and Chromium

npm install -g agent-browser### Setup (one-time, in GitHub repo settings)

npx playwright install chromium

1. **Add secret** — `Settings → Secrets and variables → Actions → New repository secret`

# Configure your API key   - Name: `ANTHROPIC_API_KEY`

cp .env.example .env   - Value: your Anthropic API key

# Edit .env — set ANTHROPIC_API_KEY=sk-ant-...

```2. **Enable browser tests** — `Settings → Secrets and variables → Actions → Variables → New repository variable`

   - Name: `RUN_BROWSER_TESTS`

### Running locally   - Value: `true`



```bash> The `RUN_BROWSER_TESTS` variable acts as an opt-in gate. This prevents the browser test job from running (and failing) on forks or PRs from contributors who don't have the secret configured.

# Run a specific test

npx tsx src/runner.ts --test tests/TC001-todomvc-add-and-complete.yaml## How to write a test case



# Run all testsCreate a YAML file in `tests/`. See `tests/TC001-todomvc-add-and-complete.yaml` for the format:

npx tsx src/runner.ts --all

```yaml

# Interactive mode (human-in-the-loop, for debugging)id: TC002

npx tsx src/runner.ts --provider interactivetitle: "Search for a product"

priority: P2

# Type-checktags: [smoke, search]

npm run typechecktarget_url: "https://example.com"

```

# Optional: site-specific hints to help the AI agent navigate

### Building the Docker image locallysite_context:

  - "The site has a search bar in the top navigation."

```bash  - "Cookie consent banner appears on first visit — dismiss it first."

docker build -t testpilot .

preconditions:

docker run --rm \  - "Browser is open"

  -v ./tests:/app/tests \

  -v ./reports:/app/reports \steps:

  -v ./screenshots:/app/screenshots \  - step: 1

  -e ANTHROPIC_API_KEY=sk-ant-... \    action: "Type 'laptop' in the search bar and press Enter"

  testpilot --test tests/TC001-todomvc-add-and-complete.yaml    expected: "Search results page shows laptop products"

``````



---### `site_context` field



## ArchitectureThe `site_context` field is an optional array of hints that get injected into the

AI agent's system prompt at runtime. Use it to provide site-specific knowledge like:

```

┌─────────────────────────────────────────────────────────────┐- Cookie banner behavior and button labels

│                      Test Runner (runner.ts)                │- Navigation structure and URL patterns

│  Reads YAML test case → orchestrates step-by-step loop     │- UI patterns (carousels, accordions, modals)

└──────────┬──────────────────────────────┬───────────────────┘- Element naming conventions

           │                              │

           ▼                              ▼This keeps the core agent generic while allowing tests to carry domain-specific context.

┌─────────────────────┐       ┌──────────────────────────────┐

│   LLM Adapter       │       │   Browser Helper (browser.ts)│## Project status

│   (llm-adapter.ts)  │       │   Wraps agent-browser CLI    │

│                     │       │                              │**Phase: Multi-provider autonomous execution ✅**

│  ✅ Anthropic       │       │   open, click, fill, snap,   │

│  ⚠️  GitHub Models   │       │   screenshot, scroll, etc.   │- [x] Test YAML schema with site_context support

│  🧑 Interactive      │       └──────────┬───────────────────┘- [x] Browser wrapper (agent-browser integration)

└─────────────────────┘                  │- [x] Interactive LLM adapter (human-in-the-loop)

                                         ▼- [x] Test runner with step-by-step execution

                              ┌──────────────────────────────┐- [x] Report generation (JSON + Markdown)

                              │   agent-browser daemon       │- [x] Autonomous LLM execution (GitHub Models API — GPT-4.1)

                              │   (Chromium via Playwright)  │- [x] Multi-provider architecture (Anthropic, GitHub Models, Interactive)

                              └──────────────────────────────┘- [x] Anthropic adapter (Claude Sonnet 4-6)

```- [x] Externalized site-specific hints into YAML test cases

- [x] agent-browser preflight check with actionable install instructions

### How a test run works- [x] `--all` flag to run all test cases sequentially with aggregate summary

- [x] Additional demo test cases (TC001–TC005 across TodoMVC, the-internet, books.toscrape.com, demoqa.com)

1. The runner reads a YAML test case and opens the target URL- [x] CI/CD pipeline (GitHub Actions — type-check on every push, browser tests with artifact upload)

2. For each step, it takes an **accessibility snapshot** of the page- [ ] Assisted test case creation (record browser session → YAML)

3. The snapshot + step instructions are sent to the LLM- [ ] Web UI and SaaS deployment

4. The LLM decides which `agent-browser` commands to execute (click, fill, etc.)

5. The runner executes the commands and takes a new snapshot## License

6. The LLM verifies the expected result against the snapshot

7. Steps repeat until pass or fail — then a report is generatedThis project is open source and licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.



### Key filesThis means you are free to use, modify, and distribute this software, but if you run a modified version

as a network service (e.g., SaaS), you **must** make the complete source code of your modified version

| File | Purpose |available to users of that service under the same license.

| ---- | ------- |

| `src/runner.ts` | Main orchestrator — reads YAML, runs steps, generates reports |See [LICENSE.md](LICENSE.md) for the full license text.

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
