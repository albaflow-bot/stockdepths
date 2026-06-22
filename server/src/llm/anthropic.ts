/**
 * Anthropic provider — Claude Sonnet 4.6, the SPEC §3.2 primary model for the
 * daily oneshot ("Claude Sonnet 4.6 primary (quality + reasoning)").
 *
 * Uses the official @anthropic-ai/sdk. The API key is read from the environment
 * only (never hard-coded). The provider returns raw text; the pipeline extracts
 * and validates the JSON, so this stays a thin wrapper.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmCompletion, LlmProvider, LlmRequest } from "./types.js";

/** SPEC-mandated primary model. Overridable via env for pinning. */
const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  /** Injectable client for tests. */
  client?: Pick<Anthropic, "messages">;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly apiKey?: string;
  private readonly model: string;
  private client?: Pick<Anthropic, "messages">;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    this.model = opts.model ?? process.env["ANTHROPIC_PICKS_MODEL"] ?? DEFAULT_MODEL;
    this.client = opts.client;
  }

  isAvailable(): boolean {
    return Boolean(this.client) || Boolean(this.apiKey);
  }

  private getClient(): Pick<Anthropic, "messages"> {
    if (this.client) return this.client;
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set; Anthropic provider unavailable.");
    }
    this.client = new Anthropic({ apiKey: this.apiKey });
    return this.client;
  }

  async complete(req: LlmRequest): Promise<LlmCompletion> {
    const res = await this.getClient().messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text.trim()) {
      throw new Error("Anthropic returned an empty response");
    }
    return { text, model: res.model ?? this.model };
  }
}
