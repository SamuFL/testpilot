/**
 * LLM Adapter — provider factory and public API re-exports.
 *
 * Providers:
 * - "interactive"     — human-in-the-loop via stdin (MVP bootstrap)
 * - "github-models"   — GitHub Models API (preview, limited to GPT-4.1)
 * - "anthropic"       — Anthropic API (Claude Sonnet 4-6, recommended)
 *
 * Provider selection is controlled by the MODEL_PROVIDER env var in .env.
 */

// Re-export shared types and helpers so consumers only import from llm-adapter
export {
  type LLMProvider,
  type LLMRequest,
  type LLMAdapter,
  ACTION_SCHEMA,
  buildUserMessage,
  parseAgentResponse,
  logAction,
} from "./llm-shared.js";

import type { LLMProvider, LLMAdapter } from "./llm-shared.js";
import { InteractiveLLMAdapter } from "./providers/interactive.js";
import { GitHubModelsAdapter } from "./providers/github-models.js";
import { AnthropicAdapter } from "./providers/anthropic.js";

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createLLMAdapter(provider: LLMProvider): LLMAdapter {
  switch (provider) {
    case "interactive":
      return new InteractiveLLMAdapter();
    case "github-models":
      return new GitHubModelsAdapter();
    case "anthropic":
      return new AnthropicAdapter();
    default:
      throw new Error(
        `LLM provider "${provider}" is not supported. ` +
          `Available: interactive, github-models, anthropic`
      );
  }
}
