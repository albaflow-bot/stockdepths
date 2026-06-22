/**
 * Gemini provider — the SPEC §3.2 fallback ("Optional Gemini for cost scaling if
 * server load exceeds threshold. OAuth + API key fallback pattern.").
 *
 * Calls the Generative Language REST API via fetch (no extra SDK dependency).
 * The API key is read from the environment only. Returns raw text; the pipeline
 * extracts + validates the JSON, sharing the same contract as the Anthropic
 * provider. The fetch implementation is injectable for deterministic tests.
 */

import type { LlmCompletion, LlmProvider, LlmRequest } from "./types.js";

const DEFAULT_MODEL = "gemini-2.0-flash";

/** Minimal injectable fetch shape (subset of WHATWG fetch). */
export type JsonFetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  fetcher?: JsonFetcher;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fetcher?: JsonFetcher;

  constructor(opts: GeminiProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
    this.model = opts.model ?? process.env["GEMINI_PICKS_MODEL"] ?? DEFAULT_MODEL;
    this.fetcher = opts.fetcher;
  }

  isAvailable(): boolean {
    return Boolean(this.fetcher) || Boolean(this.apiKey);
  }

  private resolveFetcher(): JsonFetcher {
    if (this.fetcher) return this.fetcher;
    if (typeof globalThis.fetch === "function") {
      return globalThis.fetch as unknown as JsonFetcher;
    }
    throw new Error("No fetch implementation available for Gemini provider.");
  }

  async complete(req: LlmRequest): Promise<LlmCompletion> {
    if (!this.apiKey && !this.fetcher) {
      throw new Error("GEMINI_API_KEY is not set; Gemini provider unavailable.");
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey ?? ""}`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: req.maxTokens ?? 4096,
        temperature: 0.6,
      },
    });

    const res = await this.resolveFetcher()(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }

    const data = JSON.parse(await res.text()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    if (!text.trim()) {
      throw new Error("Gemini returned an empty response");
    }
    return { text, model: this.model };
  }
}
