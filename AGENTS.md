# AGENTS.md — Instructions for AI Agents Working on This Project

## Project Context

This is **testpilot**: an AI-powered test suite that
executes manual-style test cases against any web application using `agent-browser`.

## Issue Tracking

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Technology Stack

- **TypeScript** with Node.js (ES modules, `tsx` for execution)
- **agent-browser** (v0.15.1+) — headless browser CLI for AI agents
- **beads / bd** — issue tracking (`.beads/` directory)
- **YAML** — test case definitions in `tests/`

## Project Structure

```
testpilot/
├── AGENTS.md              ← You are here
├── README.md              ← Human-readable docs
├── Dockerfile             ← Docker image (runner + agent-browser + Chromium)
├── .dockerignore          ← Excludes tests/, reports/, .env, etc. from image
├── package.json           ← Node project config (type: module)
├── tsconfig.json          ← TypeScript config
├── tests/                 ← Test case YAML files (NOT included in Docker image)
│   ├── TC001-todomvc-add-and-complete.yaml
│   ├── TC002-the-internet-valid-login.yaml
│   ├── TC003-the-internet-invalid-login.yaml
│   ├── TC004-books-toscrape-browse-and-detail.yaml
│   └── TC005-demoqa-practice-form.yaml
├── src/                   ← TypeScript source
│   ├── runner.ts          ← Main test runner / orchestrator
│   ├── browser.ts         ← agent-browser CLI wrapper
│   ├── llm-adapter.ts     ← LLM types, shared helpers, provider factory
│   ├── llm-shared.ts      ← Shared types/constants/helpers (no circular deps)
│   ├── providers/         ← LLM provider implementations
│   │   ├── anthropic.ts   ← Anthropic (Claude Sonnet 4-6, recommended)
│   │   ├── github-models.ts ← GitHub Models API (GPT-4.1, preview)
│   │   └── interactive.ts ← Human-in-the-loop via stdin
│   └── types.ts           ← Type definitions
├── reports/               ← Generated test reports (gitignored)
├── screenshots/           ← Step screenshots (gitignored)
└── .beads/                ← Beads issue database (gitignored)
```

## How Things Work

### Test Cases (YAML)

Tests are defined as natural-language YAML files. Each has:

- `id`, `title`, `priority`, `tags` — metadata
- `target_url` — the website to test
- `site_context` — optional array of site-specific hints for the AI agent
- `preconditions` — what must be true before the test
- `steps[]` — sequential actions with `action` (what to do) and `expected` (what should happen)

Steps are intentionally written in plain language, NOT with CSS selectors or code.
The AI agent discovers UI elements at runtime via `agent-browser snapshot`.

The `site_context` field allows each test to carry domain-specific knowledge (cookie
banners, navigation structure, UI patterns) without hardcoding it in the system prompt.

### Test Runner (`src/runner.ts`)

The runner reads a YAML test case and iterates through steps:

1. Takes a browser snapshot (accessibility tree with `[ref=eN]` markers)
2. Builds a system prompt (generic rules + site_context from YAML)
3. Presents the snapshot + step instructions to the LLM adapter
4. LLM decides what `agent-browser` commands to execute
5. Runner executes them, captures results
6. Moves to next step or records failure
7. Generates JSON + Markdown report

### Browser Wrapper (`src/browser.ts`)

Thin async wrapper around `agent-browser` CLI. Key functions:

- `openUrl(url)`, `getSnapshot()`, `click(ref)`, `fill(ref, text)`
- `takeStepScreenshot(testId, step, dir)` — timestamped screenshots
- `runBrowserCommand(args)` — generic command execution

### LLM Adapter (`src/llm-adapter.ts` + `src/providers/`)

Abstraction layer for the AI decision-maker. The adapter interface is defined in
`llm-adapter.ts` along with shared helpers (message building, response parsing).
Each provider has its own file in `src/providers/`:

- **`anthropic.ts`** — Anthropic Messages API (Claude Sonnet 4-6). Recommended provider.
- **`github-models.ts`** — GitHub Models API (GPT-4.1). Preview service, rate limits apply.
- **`interactive.ts`** — Human-in-the-loop via stdin. Useful for debugging.

Provider selection: `MODEL_PROVIDER` env var → `--provider` CLI flag → auto-detect from API keys.

## Working on This Project

### Running tests

```bash
npx tsx src/runner.ts                                    # default test (first YAML)
npx tsx src/runner.ts --all                              # run all tests sequentially
npx tsx src/runner.ts --test tests/TC001-*.yaml          # specific test
```

### Adding a new test case

1. Create `tests/TCNNN-descriptive-name.yaml`
2. Follow the schema in `src/types.ts` (TestCase interface)
3. Write steps in natural language — no selectors needed
4. Add `site_context` hints if the target site has specific UI patterns

## Key Design Decisions

1. **Natural language test steps** — Tests read like manual test scripts. No
   CSS selectors or XPath in test definitions. The agent discovers elements at
   runtime via accessibility snapshots.

2. **agent-browser as the browser layer** — Uses the snapshot→ref→action pattern.
   The agent reads the accessibility tree, identifies elements by `[ref=eN]`, and
   interacts using `@eN` refs.

3. **Pluggable LLM** — The `llm-adapter.ts` is a strategy pattern with provider
   implementations in `src/providers/`. Currently supports Anthropic (recommended),
   GitHub Models (preview), and interactive mode. New providers can be added by
   implementing the `LLMAdapter` interface.

4. **YAML test definitions** — Human-readable, version-controllable, and
   eventually importable from/exportable to JIRA X-Ray.

5. **Externalized site context** — Site-specific knowledge lives in the YAML test
   case (`site_context` field), not in the hardcoded system prompt. This makes
   the runner generic and each test self-contained.

## Browser Automation Learnings

These are lessons learned from running tests against real websites. They are encoded
in the system prompt in `src/runner.ts` so the LLM knows them at execution time.

### General Rules

1. **Always re-snapshot after actions.** Refs (`@eN`) are invalidated whenever the
   DOM changes. A click that navigates to a new page makes ALL previous refs stale.
   Never reuse refs from a previous snapshot.

2. **Cookie banners block everything.** Most sites show a cookie consent overlay on
   first load. Elements behind the overlay exist in the DOM (and the snapshot) but
   cannot be clicked — clicks will time out. **Dismiss the cookie banner first.**

3. **Carousel/slider items may not be clickable.** Elements inside carousels are in
   the accessibility tree but may be off-screen or behind other elements. If a click
   times out, look for alternative links (icon links, navigation items, or direct URLs).

4. **Wait after navigation.** After clicks that trigger page loads or AJAX, wait
   briefly (`wait 1500` or `wait --load networkidle`) before re-snapshotting.

5. **Adapt on failure — don't retry blindly.** If a command fails:
   - Re-snapshot to understand the current state
   - Look for alternative elements
   - Scroll to reveal off-screen elements
   - As a last resort, navigate directly via URL

6. **Watch for `[nth=N]` markers.** When multiple elements share the same name, the
   snapshot marks duplicates with `[nth=N]`. Read surrounding context to pick the
   correct one.

## Roadmap

- **Autonomous execution** — LLM reads snapshot and decides commands without human input ✅
- **Multi-test suites** — Run multiple YAML files in sequence with aggregate reports ✅
- **Demo test cases** — TC001–TC005 covering TodoMVC, auth flows, navigation, complex forms ✅
- **agent-browser preflight check** — fail fast with install instructions if CLI missing ✅
- **CI/CD** — Run tests in headless mode in pipelines (tracked: `testpilot-guw`)
- **Assisted test case creation** — Record a browser session and generate YAML automatically (tracked: `testpilot-fnj`)
- **JIRA X-Ray integration** — Import test cases from X-Ray, report results back
- **Visual regression** — Use `agent-browser diff` for visual comparisons
- **Web UI** — Browser-based dashboard for running and reviewing tests (tracked: `testpilot-kwt`)
- **SaaS deployment** — Hosted service for teams (tracked: `testpilot-2pm`)

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - `npx tsc --noEmit` to type-check
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session
