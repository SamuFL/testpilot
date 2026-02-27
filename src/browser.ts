/**
 * Browser helper — wraps agent-browser CLI calls into async functions.
 *
 * agent-browser is a CLI tool that manages a persistent browser daemon.
 * We shell out to it and capture stdout. Each command reuses the same
 * browser session behind the scenes.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const AGENT_BROWSER = "agent-browser";
const DEFAULT_TIMEOUT = 30_000; // 30s per command

/**
 * Check that the `agent-browser` CLI is installed and reachable on PATH.
 * Throws a descriptive error with install instructions if it is missing.
 */
export async function checkAgentBrowser(): Promise<void> {
  try {
    await execFileAsync(AGENT_BROWSER, ["--version"], { timeout: 5_000 });
  } catch (err: any) {
    // ENOENT means the binary was not found on PATH
    if (err.code === "ENOENT") {
      console.error(`
ERROR: \`agent-browser\` CLI not found on PATH.

testpilot requires the agent-browser CLI to control the browser.
Install it globally with npm:

    npm install -g agent-browser

Then install the required Playwright browser (Chromium):

    npx playwright install chromium

After that, re-run testpilot.
`);
      process.exit(1);
    }
    // Any other error (e.g. non-zero exit) still means the binary exists — ignore it.
  }
}

export interface BrowserCommandResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

/**
 * Run an agent-browser command and return the output.
 * Commands are passed as an array of arguments, e.g. ["open", "https://example.com"]
 */
export async function runBrowserCommand(
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<BrowserCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(AGENT_BROWSER, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (err: any) {
    return {
      stdout: err.stdout?.trim() ?? "",
      stderr: err.stderr?.trim() ?? err.message,
      success: false,
    };
  }
}

/** Open a URL in the browser */
export async function openUrl(url: string): Promise<BrowserCommandResult> {
  return runBrowserCommand(["open", url]);
}

/** Get an accessibility snapshot (interactive elements only, compact) */
export async function getSnapshot(): Promise<string> {
  const result = await runBrowserCommand(["snapshot", "-i", "-c"]);
  return result.stdout;
}

/** Get a full accessibility snapshot (all elements) */
export async function getFullSnapshot(): Promise<string> {
  const result = await runBrowserCommand(["snapshot", "-c"]);
  return result.stdout;
}

/** Click an element by ref or selector */
export async function click(selector: string): Promise<BrowserCommandResult> {
  return runBrowserCommand(["click", selector]);
}

/** Fill a field by ref or selector */
export async function fill(
  selector: string,
  value: string
): Promise<BrowserCommandResult> {
  return runBrowserCommand(["fill", selector, value]);
}

/** Take a screenshot, optionally annotated */
export async function screenshot(
  filepath: string,
  annotate: boolean = false
): Promise<BrowserCommandResult> {
  const args = ["screenshot", filepath];
  if (annotate) args.push("--annotate");
  return runBrowserCommand(args);
}

/** Wait for a condition */
export async function waitFor(
  condition: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<BrowserCommandResult> {
  // condition can be a selector, --text "...", --url "...", --load networkidle, or ms
  return runBrowserCommand(["wait", condition], timeoutMs);
}

/** Wait for network idle */
export async function waitForNetworkIdle(): Promise<BrowserCommandResult> {
  return runBrowserCommand(["wait", "--load", "networkidle"], 30_000);
}

/** Get the current page URL */
export async function getUrl(): Promise<string> {
  const result = await runBrowserCommand(["get", "url"]);
  return result.stdout;
}

/** Get the current page title */
export async function getTitle(): Promise<string> {
  const result = await runBrowserCommand(["get", "title"]);
  return result.stdout;
}

/** Scroll the page */
export async function scroll(direction: "up" | "down", pixels?: number): Promise<BrowserCommandResult> {
  const args = ["scroll", direction];
  if (pixels) args.push(String(pixels));
  return runBrowserCommand(args);
}

/** Close the browser session */
export async function closeBrowser(): Promise<BrowserCommandResult> {
  return runBrowserCommand(["close"]);
}

/** Take a timestamped screenshot and return the file path */
export async function takeStepScreenshot(
  testId: string,
  stepNumber: number,
  screenshotsDir: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${testId}_step${stepNumber}_${timestamp}.png`;
  const filepath = path.join(screenshotsDir, filename);
  await screenshot(filepath);
  return filepath;
}
