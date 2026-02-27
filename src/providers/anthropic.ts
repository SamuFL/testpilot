/**
 * Anthropic Adapter — autonomous LLM via the Anthropic Messages API.
 *
 * Uses Claude models (default: claude-sonnet-4-6) for autonomous test execution.
 * Anthropic's API has generous rate limits and large context windows, making it
 * the recommended provider for production use.
 *
 * Expects environment variables:
 *   ANTHROPIC_API_KEY — Anthropic API key (sk-ant-...)
 *   ANTHROPIC_MODEL   — model ID (default: "claude-sonnet-4-6")
 */

import type { AgentAction } from "../types.js";
import type { LLMAdapter, LLMRequest } from "../llm-shared.js";
import {
  ACTION_SCHEMA,
  buildUserMessage,
  parseAgentResponse,
  logAction,
} from "../llm-shared.js";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

export class AnthropicAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY not set. " +
          "Create a .env file from .env.example and add your Anthropic API key."
      );
    }
    this.apiKey = apiKey;
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
    console.log(`🤖 Anthropic adapter initialized (model: ${this.model})`);
  }

  async decideAction(request: LLMRequest): Promise<AgentAction> {
    if (request.previousActions.length === 0) {
      this.conversationHistory = [];
    }

    const userMessage = buildUserMessage(request);

    // Anthropic uses `system` as a top-level parameter, not a message role
    const systemPrompt =
      request.systemPrompt + "\n\n## Response Format\n\n" + ACTION_SCHEMA;

    const messages = [
      ...this.conversationHistory,
      { role: "user", content: userMessage },
    ];

    console.log(`  🧠 Asking ${this.model}...`);

    const response = await this.callApi(systemPrompt, messages);

    this.conversationHistory.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: response }
    );

    const action = parseAgentResponse(response);
    logAction(action);
    return action;
  }

  private async callApi(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const body = {
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    };

    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const parsedWait = retryAfter ? parseInt(retryAfter, 10) : NaN;
        const waitSec =
          !isNaN(parsedWait) && parsedWait > 0 && parsedWait <= 60
            ? parsedWait
            : Math.min(10 * (attempt + 1), 30);
        console.log(
          `  ⏳ Rate limited (429). Waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}...`
        );
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        lastError = new Error(`Rate limited (429)`);
        continue;
      }

      if (response.status === 529) {
        // Anthropic overloaded
        const waitSec = Math.min(15 * (attempt + 1), 45);
        console.log(
          `  ⏳ Anthropic overloaded (529). Waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}...`
        );
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        lastError = new Error(`Anthropic overloaded (529)`);
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(
          `Anthropic API error ${response.status}: ${errBody.slice(0, 500)}`
        );
      }

      const data = (await response.json()) as any;

      // Anthropic response: { content: [{ type: "text", text: "..." }] }
      const textBlock = data.content?.find(
        (block: any) => block.type === "text"
      );
      if (!textBlock?.text) {
        throw new Error(
          `Unexpected Anthropic response structure: ${JSON.stringify(data).slice(0, 500)}`
        );
      }

      return textBlock.text;
    }

    throw lastError || new Error("Max retries exceeded");
  }
}
