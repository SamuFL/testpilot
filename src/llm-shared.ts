/**
 * Shared LLM types, constants, and helpers.
 *
 * This module is imported by both llm-adapter.ts (factory) and the individual
 * provider implementations. It has NO imports from providers/ to avoid circular deps.
 */

import type { AgentAction } from "./types.js";

// ─── Public types ────────────────────────────────────────────────────────────

export type LLMProvider = "interactive" | "github-models" | "anthropic";

export interface LLMRequest {
  systemPrompt: string;
  stepDescription: string;
  expectedResult: string;
  browserState: string; // current accessibility snapshot
  previousActions: string[]; // commands already executed this step
  pageUrl: string;
  pageTitle: string;
}

export interface LLMAdapter {
  /**
   * Ask the LLM what agent-browser commands to run for the current step.
   * Returns an AgentAction with the commands to execute.
   */
  decideAction(request: LLMRequest): Promise<AgentAction>;
}

// ─── Shared constants ────────────────────────────────────────────────────────

export const ACTION_SCHEMA = `You MUST respond with ONLY a valid JSON object (no markdown, no backticks, no explanation outside the JSON). The schema:
{
  "thought": "your reasoning about what to do next",
  "commands": ["command1", "command2"],
  "done": false,
  "success": false,
  "actual_result": ""
}

Fields:
- thought: brief reasoning about the current state and what you'll do
- commands: array of agent-browser CLI commands to execute (e.g. ["click @e5", "wait 1500"])
- done: true if the step is COMPLETE (either passed or failed), false if more actions needed
- success: true if the expected result is achieved (only meaningful when done=true)
- actual_result: what actually happened (only meaningful when done=true)

IMPORTANT:
- Return 1-3 commands at a time, then wait for the next snapshot.
- After any click/fill/navigation, your commands list should end there — you need a fresh snapshot before continuing.
- When done=false, you MUST provide at least one command.
- When done=true, commands can be empty.`;

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Build the user message for an LLM turn, including step context and browser snapshot.
 */
export function buildUserMessage(request: LLMRequest): string {
  let msg = "";

  if (request.previousActions.length === 0) {
    msg += `## Current Test Step\n\n`;
    msg += `**Action:** ${request.stepDescription}\n`;
    msg += `**Expected result:** ${request.expectedResult}\n\n`;
  } else {
    msg += `## After executing: ${request.previousActions.slice(-3).join(", ")}\n\n`;
  }

  msg += `**Page URL:** ${request.pageUrl}\n`;
  msg += `**Page title:** ${request.pageTitle}\n\n`;
  msg += `## Browser Accessibility Snapshot\n\n`;
  msg += "```\n" + request.browserState + "\n```\n";

  if (request.previousActions.length > 0) {
    msg += `\n## Commands executed so far this step\n\n`;
    msg += request.previousActions.map((c) => `- \`${c}\``).join("\n") + "\n";
  }

  msg += `\nDecide the next action(s). Respond with JSON only.`;

  return msg;
}

/**
 * Parse a raw LLM response string into an AgentAction.
 * Handles markdown code fences and JSON extraction.
 */
export function parseAgentResponse(raw: string): AgentAction {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      thought: parsed.thought || "",
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      done: Boolean(parsed.done),
      success: Boolean(parsed.success),
      actual_result: parsed.actual_result || "",
    };
  } catch (err) {
    console.warn(`  ⚠️  Failed to parse LLM response as JSON. Raw:\n${raw.slice(0, 500)}`);
    return {
      thought: `Parse error — raw response: ${raw.slice(0, 200)}`,
      commands: [],
      done: false,
      success: false,
      actual_result: "",
    };
  }
}

/**
 * Log the action decided by the LLM to the console.
 */
export function logAction(action: AgentAction): void {
  console.log(`  💭 Thought: ${action.thought}`);
  if (action.commands.length > 0) {
    console.log(`  📝 Commands: ${action.commands.join(" → ")}`);
  }
  if (action.done) {
    console.log(
      `  ${action.success ? "✅" : "❌"} Done: ${action.actual_result}`
    );
  }
}
