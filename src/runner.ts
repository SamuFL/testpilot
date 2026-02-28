/**
 * Test Runner — the main orchestrator.
 *
 * Reads a YAML test case, opens the browser, and for each step:
 * 1. Takes a snapshot of the browser state
 * 2. Asks the LLM adapter what commands to run
 * 3. Executes the commands via agent-browser
 * 4. Records pass/fail and takes a screenshot
 * 5. Produces a JSON + Markdown report
 *
 * Usage:
 *   npx tsx src/runner.ts                              # runs default test
 *   npx tsx src/runner.ts --test tests/TC001-*.yaml    # runs specific test
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { TestCase, TestReport, StepResult } from "./types.js";
import {
  checkAgentBrowser,
  openUrl,
  getSnapshot,
  closeBrowser,
  runBrowserCommand,
  takeStepScreenshot,
  waitForNetworkIdle,
  getUrl,
  getTitle,
} from "./browser.js";
import { createLLMAdapter, type LLMProvider, type LLMRequest } from "./llm-adapter.js";

// ─── Load .env ───────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    ".env"
  );
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      // Always use .env value — it takes priority over inherited shell env
      process.env[key] = value;
    }
  }
}

loadEnv();

// ─── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  ".."
);
const TESTS_DIR = path.join(PROJECT_ROOT, "tests");
const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, "screenshots");

const SYSTEM_PROMPT = `You are an expert manual tester executing test cases on a web application.
You interact with the browser using agent-browser CLI commands.
Your job is to follow the test step instructions exactly as a human tester would.

## agent-browser Commands

Core commands:
- click @eN          — click element by ref from snapshot
- fill @eN "text"    — clear and fill a field
- type @eN "text"    — type into a field (appends to existing)
- select @eN "val"   — select dropdown option
- scroll down/up [px] — scroll the page
- hover @eN          — hover over an element
- press Enter/Tab    — press keyboard keys
- wait --load networkidle — wait for page to settle
- wait 2000          — wait N milliseconds

The snapshot shows elements like:
  - button "Add to cart" [ref=e5]
  - link "Products" [ref=e12]
  - textbox "Search" [ref=e3]

Use the [ref=eN] values with @eN to interact.

## Verification & Judgment Rules

YOU ARE A STRICT TESTER. Your job is to VERIFY outcomes, not assume them.

1. NEVER ASSUME SUCCESS. After performing an action, you MUST re-snapshot and
   verify the expected result is actually visible in the new snapshot before
   marking a step as done+success. A command executing without error does NOT
   mean the expected result was achieved.

2. VERIFY AGAINST THE EXPECTED RESULT. The step has an "expected result" —
   you must find concrete evidence of that result in the snapshot (e.g., text
   appearing, page navigating, elements changing state). If you cannot find
   evidence, the step FAILS.

3. FILL VERIFICATION: After a "fill" command, re-snapshot and check that the
   field value in the snapshot reflects what was typed. Accessibility snapshots
   show field values — look for them.

4. NAVIGATION VERIFICATION: After a click that should navigate, verify the
   page URL or title changed to match the expected destination.

5. FAIL FAST. If after 3 attempts to achieve the expected result you still
   cannot verify it, mark the step as done=true, success=false with a clear
   explanation of what you tried and what you observed instead. Do NOT keep
   retrying the same approach.

6. BE HONEST IN actual_result. Report what the snapshot ACTUALLY shows, not
   what you hope happened. Quote specific text or elements from the snapshot
   as evidence.

## Browser Automation Rules

1. ALWAYS RE-SNAPSHOT after any action that changes the page (click, fill+submit,
   navigation). Refs are invalidated when the DOM changes — using stale refs will fail.

2. COOKIE BANNERS: Many sites show a cookie consent banner on first load that
   overlays the page and blocks interaction with elements behind it. Look for buttons
   like "Accept all", "Accept cookies", or similar in the snapshot and dismiss the
   banner FIRST before attempting any other interaction.

3. ELEMENTS IN CAROUSELS/SLIDERS may be present in the accessibility tree but not
   actually visible or clickable. If a click times out, look for alternative elements
   that achieve the same navigation (e.g., icon links, navigation bar items, or
   use direct URL navigation via the "open" command).

4. WAIT AFTER ACTIONS: After clicking links or buttons that trigger navigation or
   AJAX, wait briefly (wait 1500 or wait --load networkidle) before re-snapshotting
   to let the page settle.

5. ADAPT ON FAILURE: If a command fails (timeout, element not found), do NOT repeat
   the same command. Instead:
   a. Re-snapshot to see the current page state
   b. Look for alternative elements or approaches
   c. Consider scrolling — the element may be off-screen
   d. As a last resort, navigate directly via URL if you can infer it

6. MULTIPLE ELEMENTS WITH SAME NAME: The snapshot marks duplicates with [nth=N].
   Make sure to pick the correct instance. Read surrounding context in the snapshot
   to identify which one matches your intent.`;

/**
 * Build the full system prompt, appending site-specific context from the test case
 * if available. This keeps the core prompt generic while allowing each test to
 * carry its own domain knowledge.
 */
function buildSystemPrompt(testCase: TestCase): string {
  let prompt = SYSTEM_PROMPT;
  if (testCase.site_context && testCase.site_context.length > 0) {
    prompt += `\n\n## Site-Specific Context\n\n`;
    prompt += testCase.site_context.map((hint) => `- ${hint}`).join("\n");
  }
  return prompt;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a command string into an array of arguments, respecting quoted strings.
 * Handles both single and double quotes. Quotes are stripped from the result,
 * and quoted values containing spaces are kept as a single token.
 *
 * Examples:
 *   `fill @e2 "tomsmith"`       → ["fill", "@e2", "tomsmith"]
 *   `fill @e5 "hello world"`    → ["fill", "@e5", "hello world"]
 *   `click @e3`                 → ["click", "@e3"]
 *   `fill @e2 'some "value"'`   → ["fill", "@e2", 'some "value"']
 */
function parseCommand(cmd: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];

    if (inQuote) {
      if (ch === inQuote) {
        // Closing quote — end the quoted section (don't add the quote char)
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      // Opening quote — start a quoted section (don't add the quote char)
      inQuote = ch;
    } else if (/\s/.test(ch)) {
      // Whitespace outside quotes — push current token if non-empty
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }

  // Push the last token
  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

function loadTestCase(filepath: string): TestCase {
  const raw = fs.readFileSync(filepath, "utf-8");
  return parseYaml(raw) as TestCase;
}

function ensureDirs() {
  for (const dir of [REPORTS_DIR, SCREENSHOTS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function writeReport(report: TestReport) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // JSON report
  const jsonPath = path.join(
    REPORTS_DIR,
    `${report.test_id}_${timestamp}.json`
  );
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 JSON report: ${jsonPath}`);

  // Markdown report
  const mdPath = path.join(REPORTS_DIR, `${report.test_id}_${timestamp}.md`);
  const md = generateMarkdownReport(report);
  fs.writeFileSync(mdPath, md);
  console.log(`📝 Markdown report: ${mdPath}`);
}

function generateMarkdownReport(report: TestReport): string {
  const statusEmoji =
    report.status === "pass" ? "✅" : report.status === "fail" ? "❌" : "⚠️";
  let md = `# Test Report: ${report.test_id} — ${report.title}\n\n`;
  md += `**Status:** ${statusEmoji} ${report.status.toUpperCase()}\n`;
  md += `**Started:** ${report.started_at}\n`;
  md += `**Finished:** ${report.finished_at}\n`;
  md += `**Duration:** ${(report.duration_ms / 1000).toFixed(1)}s\n\n`;
  md += `## Summary\n\n${report.summary}\n\n`;
  md += `## Steps\n\n`;

  for (const step of report.steps) {
    const emoji =
      step.status === "pass"
        ? "✅"
        : step.status === "fail"
          ? "❌"
          : step.status === "skipped"
            ? "⏭️"
            : "⚠️";
    md += `### Step ${step.step}: ${emoji} ${step.status.toUpperCase()}\n\n`;
    md += `**Action:** ${step.action}\n\n`;
    md += `**Expected:** ${step.expected}\n\n`;
    md += `**Actual:** ${step.actual}\n\n`;
    if (step.commands_executed.length > 0) {
      md += `**Commands:**\n`;
      for (const cmd of step.commands_executed) {
        md += `- \`${cmd}\`\n`;
      }
      md += "\n";
    }
    if (step.screenshot) {
      md += `**Screenshot:** [${path.basename(step.screenshot)}](${step.screenshot})\n\n`;
    }
    md += `**Duration:** ${(step.duration_ms / 1000).toFixed(1)}s\n\n`;
    md += "---\n\n";
  }

  return md;
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

async function runTestCase(testFile: string, provider: LLMProvider): Promise<TestReport> {
  const testCase = loadTestCase(testFile);
  const adapter = createLLMAdapter(provider);
  const systemPrompt = buildSystemPrompt(testCase);
  const startedAt = new Date();

  console.log("\n" + "╔" + "═".repeat(78) + "╗");
  console.log(
    `║  🧪 Running: ${testCase.id} — ${testCase.title}`.padEnd(79) + "║"
  );
  console.log("╚" + "═".repeat(78) + "╝");
  console.log(`\nPreconditions:`);
  testCase.preconditions.forEach((p) => console.log(`  • ${p}`));
  console.log(`\nSteps: ${testCase.steps.length}`);
  console.log(`Target: ${testCase.target_url}\n`);

  // Open the browser
  console.log("🌐 Opening browser...");
  await openUrl(testCase.target_url);
  await waitForNetworkIdle();

  const stepResults: StepResult[] = [];
  let overallStatus: "pass" | "fail" | "error" = "pass";

  for (const step of testCase.steps) {
    const stepStart = Date.now();
    console.log(`\n${"▓".repeat(80)}`);
    console.log(`▓  STEP ${step.step} of ${testCase.steps.length}`);
    console.log(`${"▓".repeat(80)}`);

    const allCommands: string[] = [];
    let stepStatus: "pass" | "fail" | "error" | "skipped" = "pass";
    let actualResult = "";

    try {
      // Get current browser state
      let snapshot = await getSnapshot();
      let url = await getUrl();
      let title = await getTitle();

      // Loop: ask LLM, execute commands, re-snapshot if needed
      const MAX_ITERATIONS = 10; // safety limit
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const request: LLMRequest = {
          systemPrompt: systemPrompt,
          stepDescription: step.action,
          expectedResult: step.expected,
          browserState: snapshot,
          previousActions: allCommands,
          pageUrl: url,
          pageTitle: title,
          iteration: iter + 1,
          maxIterations: MAX_ITERATIONS,
        };

        const action = await adapter.decideAction(request);

        // Execute each command
        for (const cmd of action.commands) {
          if (cmd === "__SNAPSHOT__") {
            // Re-snapshot requested
            snapshot = await getSnapshot();
            url = await getUrl();
            title = await getTitle();
            console.log("\n📸 Updated snapshot:");
            console.log(snapshot.slice(0, 2000));
            continue;
          }

          console.log(`  ⚡ Executing: agent-browser ${cmd}`);
          const parts = parseCommand(cmd);
          const result = await runBrowserCommand(parts);
          allCommands.push(cmd);

          if (result.stdout) {
            console.log(`     → ${result.stdout.slice(0, 500)}`);
          }
          if (!result.success) {
            console.log(`     ⚠️  ${result.stderr.slice(0, 500)}`);
          }

          // Brief wait after navigation-like commands
          if (["click", "fill", "select", "press"].some((c) => cmd.startsWith(c))) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }

        if (action.done) {
          stepStatus = action.success ? "pass" : "fail";
          actualResult = action.actual_result;
          break;
        }

        // If not done, re-snapshot for next iteration
        snapshot = await getSnapshot();
        url = await getUrl();
        title = await getTitle();
      }

      // If loop exhausted without the LLM declaring done, it's a fail
      if (stepStatus === "pass" && actualResult === "") {
        stepStatus = "fail";
        actualResult = `Step timed out after ${MAX_ITERATIONS} iterations without reaching a conclusion.`;
        console.log(`  ❌ Step ${step.step} exhausted ${MAX_ITERATIONS} iterations without completing.`);
      }
    } catch (err: any) {
      stepStatus = "error";
      actualResult = `Error: ${err.message}`;
      console.error(`  ❌ Error in step ${step.step}: ${err.message}`);
    }

    // Take screenshot at end of step
    let screenshotPath: string | undefined;
    try {
      screenshotPath = await takeStepScreenshot(
        testCase.id,
        step.step,
        SCREENSHOTS_DIR
      );
      console.log(`  📸 Screenshot: ${screenshotPath}`);
    } catch {
      console.log("  📸 Screenshot failed");
    }

    if (stepStatus !== "pass") {
      overallStatus = stepStatus === "error" ? "error" : "fail";
    }

    stepResults.push({
      step: step.step,
      action: step.action,
      expected: step.expected,
      status: stepStatus,
      actual: actualResult,
      reasoning: "",
      commands_executed: allCommands,
      screenshot: screenshotPath,
      duration_ms: Date.now() - stepStart,
    });

    console.log(
      `\n  ${stepStatus === "pass" ? "✅" : stepStatus === "fail" ? "❌" : "⚠️"} Step ${step.step}: ${stepStatus.toUpperCase()}`
    );

    // Abort on error
    if (stepStatus === "error") {
      console.log("  ⛔ Aborting test due to error.");
      break;
    }
  }

  const finishedAt = new Date();
  const report: TestReport = {
    test_id: testCase.id,
    title: testCase.title,
    status: overallStatus,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    steps: stepResults,
    summary: `Test ${testCase.id} ${overallStatus.toUpperCase()}. ${stepResults.filter((s) => s.status === "pass").length}/${stepResults.length} steps passed.`,
  };

  return report;
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

async function main() {
  // Safety check — fail fast with a helpful message if agent-browser is missing.
  await checkAgentBrowser();

  ensureDirs();

  // Parse --provider flag or use MODEL_PROVIDER env var
  // Priority: --provider CLI arg > MODEL_PROVIDER env var > auto-detect
  let provider: LLMProvider;
  const providerArgIdx = process.argv.indexOf("--provider");
  if (providerArgIdx !== -1 && process.argv[providerArgIdx + 1]) {
    provider = process.argv[providerArgIdx + 1] as LLMProvider;
  } else if (process.env.MODEL_PROVIDER) {
    provider = process.env.MODEL_PROVIDER as LLMProvider;
  } else if (process.env.ANTHROPIC_API_KEY) {
    provider = "anthropic";
  } else if (process.env.GITHUB_MODELS_TOKEN) {
    provider = "github-models";
  } else {
    provider = "interactive";
  }

  // Build list of test files to run
  const allYamlFiles = fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => path.join(TESTS_DIR, f));

  if (allYamlFiles.length === 0) {
    console.error("No test files found in tests/");
    process.exit(1);
  }

  let testFiles: string[];
  if (process.argv.includes("--all")) {
    testFiles = allYamlFiles;
  } else if (process.argv.indexOf("--test") !== -1) {
    const testArgIdx = process.argv.indexOf("--test");
    testFiles = [path.resolve(process.argv[testArgIdx + 1]!)];
  } else {
    // Default: first YAML in tests/
    testFiles = [allYamlFiles[0]!];
  }

  console.log(`\n🤖 Provider: ${provider}`);
  console.log(`🧪 Running ${testFiles.length} test(s)...\n`);

  const reports: TestReport[] = [];

  for (const testFile of testFiles) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`▶  ${path.basename(testFile)}`);
    console.log(`${"─".repeat(80)}`);
    try {
      const report = await runTestCase(testFile, provider);
      writeReport(report);
      reports.push(report);
      console.log("\n" + "╔" + "═".repeat(78) + "╗");
      console.log(
        `║  ${report.status === "pass" ? "✅ PASSED" : "❌ FAILED"}: ${report.test_id} — ${report.title}`.padEnd(79) + "║"
      );
      console.log("╚" + "═".repeat(78) + "╝");
    } catch (err) {
      console.error(`\n💥 Fatal error running ${path.basename(testFile)}:`, err);
    } finally {
      console.log("🔒 Closing browser...");
      await closeBrowser();
    }
  }

  // Print aggregate summary when running multiple tests
  if (reports.length > 1) {
    const passed = reports.filter((r) => r.status === "pass").length;
    const failed = reports.length - passed;
    console.log(`\n${"═".repeat(80)}`);
    console.log(`SUITE SUMMARY — ${reports.length} tests: ✅ ${passed} passed  ❌ ${failed} failed`);
    console.log(`${"═".repeat(80)}`);
    for (const r of reports) {
      const icon = r.status === "pass" ? "✅" : "❌";
      console.log(`  ${icon}  ${r.test_id.padEnd(8)} ${r.title}`);
    }
    console.log(`${"═".repeat(80)}\n`);
    if (failed > 0) process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
