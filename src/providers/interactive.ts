/**
 * Interactive LLM Adapter — human-in-the-loop via stdin.
 *
 * Prints the browser state and step instructions to the console,
 * then reads agent-browser commands from stdin. Useful for debugging
 * and manual test exploration.
 */

import * as readline from "node:readline";
import type { AgentAction } from "../types.js";
import type { LLMAdapter, LLMRequest } from "../llm-shared.js";

export class InteractiveLLMAdapter implements LLMAdapter {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    console.log("🧑 Interactive adapter initialized (human-in-the-loop)");
  }

  async decideAction(request: LLMRequest): Promise<AgentAction> {
    console.log("\n" + "═".repeat(80));
    console.log(`📋 STEP ACTION:   ${request.stepDescription}`);
    console.log(`✅ EXPECTED:      ${request.expectedResult}`);
    console.log(`🌐 URL:           ${request.pageUrl}`);
    console.log(`📄 TITLE:         ${request.pageTitle}`);
    if (request.previousActions.length > 0) {
      console.log(`⏮  PREV ACTIONS:  ${request.previousActions.join(" → ")}`);
    }
    console.log("─".repeat(80));
    console.log("BROWSER STATE (snapshot):");
    console.log(request.browserState.slice(0, 3000));
    if (request.browserState.length > 3000) {
      console.log(`... (${request.browserState.length - 3000} more chars)`);
    }
    console.log("─".repeat(80));
    console.log("Enter agent-browser commands (one per line). Empty line = done.");
    console.log("Special: PASS | FAIL | SKIP | SNAP");
    console.log("─".repeat(80));

    const commands: string[] = [];
    let done = false;
    let success = false;
    let actual = "";

    while (true) {
      const line = await this.prompt("> ");
      const trimmed = line.trim();

      if (trimmed === "") {
        const verdict = await this.prompt("Step result? (PASS/FAIL/SKIP): ");
        const v = verdict.trim().toUpperCase();
        if (v === "PASS") {
          done = true;
          success = true;
          actual = await this.prompt("Actual result (or Enter to use expected): ");
          if (!actual.trim()) actual = request.expectedResult;
          break;
        } else if (v === "FAIL") {
          done = true;
          success = false;
          actual = await this.prompt("What actually happened? ");
          break;
        } else if (v === "SKIP") {
          done = true;
          success = false;
          actual = "Step skipped";
          break;
        }
        continue;
      }

      if (trimmed.toUpperCase() === "PASS") {
        done = true;
        success = true;
        actual = request.expectedResult;
        break;
      }
      if (trimmed.toUpperCase() === "FAIL") {
        done = true;
        success = false;
        actual = await this.prompt("What actually happened? ");
        break;
      }
      if (trimmed.toUpperCase() === "SKIP") {
        done = true;
        success = false;
        actual = "Step skipped";
        break;
      }
      if (trimmed.toUpperCase() === "SNAP") {
        commands.push("__SNAPSHOT__");
        continue;
      }

      commands.push(trimmed);
    }

    return {
      thought: "Interactive mode — human/agent provided commands",
      commands,
      done,
      success,
      actual_result: actual.trim(),
    };
  }

  private prompt(query: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(query, resolve);
    });
  }

  close() {
    this.rl.close();
  }
}
