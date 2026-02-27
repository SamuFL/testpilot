/**
 * GitHub Models Adapter — autonomous LLM via GitHub Models API.
 *
 * ⚠️  PREVIEW: GitHub Models is a preview service with limitations:
 *   - GPT-5 has a 4000-token input limit (too small for browser snapshots)
 *   - Free tier has aggressive rate limits (429 errors)
 *   - Recommended model: openai/gpt-4.1
 *
 * Expects environment variables:
 *   GITHUB_MODELS_TOKEN — GitHub PAT with `models` scope
 *   GITHUB_MODELS_MODEL — model ID (default: "openai/gpt-4.1")
 */

import type { AgentAction } from "../types.js";
import type { LLMAdapter, LLMRequest } from "../llm-shared.js";
import {
  ACTION_SCHEMA,
  buildUserMessage,
  parseAgentResponse,
  logAction,
} from "../llm-shared.js";

const GITHUB_MODELS_ENDPOINT =
  "https://models.github.ai/inference/chat/completions";

export class GitHubModelsAdapter implements LLMAdapter {
  private token: string;
  private model: string;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor() {
    const token = process.env.GITHUB_MODELS_TOKEN;
    if (!token) {
      throw new Error(
        "GITHUB_MODELS_TOKEN not set. " +
          "Create a .env file from .env.example and add your GitHub PAT."
      );
    }
    this.token = token;
    this.model = process.env.GITHUB_MODELS_MODEL || "openai/gpt-4.1";
    console.log(
      `🤖 GitHub Models adapter initialized (model: ${this.model})` +
        `\n   ⚠️  GitHub Models is a preview service — rate limits may apply`
    );
  }

  async decideAction(request: LLMRequest): Promise<AgentAction> {
    if (request.previousActions.length === 0) {
      this.conversationHistory = [];
    }

    const userMessage = buildUserMessage(request);

    const messages = [
      {
        role: "system",
        content: request.systemPrompt + "\n\n## Response Format\n\n" + ACTION_SCHEMA,
      },
      ...this.conversationHistory,
      { role: "user", content: userMessage },
    ];

    console.log(`  🧠 Asking ${this.model}...`);

    const response = await this.callApi(messages);

    this.conversationHistory.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: response }
    );

    const action = parseAgentResponse(response);
    logAction(action);
    return action;
  }

  private async callApi(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const isGpt5 = this.model.includes("gpt-5");
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    if (isGpt5) {
      body.max_completion_tokens = 1024;
    } else {
      body.temperature = 0.2;
      body.max_tokens = 1024;
    }

    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(GITHUB_MODELS_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
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

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(
          `GitHub Models API error ${response.status}: ${errBody.slice(0, 500)}`
        );
      }

      const data = (await response.json()) as any;

      if (!data.choices?.[0]?.message?.content) {
        throw new Error(
          `Unexpected API response structure: ${JSON.stringify(data).slice(0, 500)}`
        );
      }

      return data.choices[0].message.content;
    }

    throw lastError || new Error("Max retries exceeded");
  }
}
