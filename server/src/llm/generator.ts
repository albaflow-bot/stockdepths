/**
 * Picks generator — runs the single daily oneshot through a provider chain.
 *
 * SPEC §3.2: Claude Sonnet 4.6 is primary; Gemini is the fallback "for cost
 * scaling if server load exceeds threshold". So provider ordering is:
 *   - load below threshold  → Anthropic first, Gemini as failover
 *   - load at/above threshold → Gemini first (shed cost), Anthropic as failover
 * Whichever runs first, the other is tried if it errors — one shared artifact
 * still results from one successful oneshot.
 */

import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import {
  LlmError,
  extractJsonObject,
  normalizeCompanyName,
  validatePicksResult,
  type LlmProvider,
  type PersonaContext,
  type PicksResult,
  type SymbolGuard,
} from "./types.js";
import type { TickerFeatures } from "../features/indicators.js";

export interface GeneratePicksInput {
  features: TickerFeatures[];
  asOfDate: string;
  marketLabel: string;
  persona?: PersonaContext;
}

/** A validated result plus which provider/model produced it. */
export interface GeneratedPicks extends PicksResult {
  provider: string;
  model: string;
}

export type PicksGenerator = (input: GeneratePicksInput) => Promise<GeneratedPicks>;

export interface GeneratorOptions {
  /** Current server load 0..1 (e.g. queue depth / capacity). Default 0. */
  load?: number;
  /** Load at/above which Gemini is preferred to shed cost. Default 0.8. */
  loadThreshold?: number;
  maxTokens?: number;
  /** Override the provider set (tests inject stubs). */
  providers?: LlmProvider[];
}

/**
 * Order providers for this run. Pure + exported so the selection policy is
 * directly testable. Only the available providers are returned.
 */
export function orderProviders(
  providers: LlmProvider[],
  load: number,
  loadThreshold: number,
): LlmProvider[] {
  const available = providers.filter((p) => p.isAvailable());
  const byName = (n: string) => available.filter((p) => p.name === n);
  const anthropic = byName("anthropic");
  const gemini = byName("gemini");
  const rest = available.filter((p) => p.name !== "anthropic" && p.name !== "gemini");
  const primaryFirst =
    load >= loadThreshold ? [...gemini, ...anthropic] : [...anthropic, ...gemini];
  return [...primaryFirst, ...rest];
}

/** Build the default provider set from environment configuration. */
export function defaultProviders(): LlmProvider[] {
  return [new AnthropicProvider(), new GeminiProvider()];
}

/**
 * Create a generator that walks the ordered provider chain, validating each
 * provider's JSON output and falling through to the next on any failure.
 */
export function makePicksGenerator(opts: GeneratorOptions = {}): PicksGenerator {
  const providers = opts.providers ?? defaultProviders();
  const load = opts.load ?? 0;
  const loadThreshold = opts.loadThreshold ?? 0.8;

  return async (input) => {
    const ordered = orderProviders(providers, load, loadThreshold);
    if (ordered.length === 0) {
      throw new LlmError(
        "No LLM provider is configured. Set ANTHROPIC_API_KEY (and optionally GEMINI_API_KEY).",
      );
    }

    const system = SYSTEM_PROMPT;
    const user = buildUserPrompt(input.features, {
      asOfDate: input.asOfDate,
      marketLabel: input.marketLabel,
      persona: input.persona,
    });

    // Enforce that picks come from the provided universe (SPEC: "반드시 제공된
    // 종목 중에서만"). The byName map recovers symbols the model glitches.
    const guard: SymbolGuard = {
      allowed: new Set(input.features.map((f) => f.symbol.toUpperCase())),
      byName: new Map(
        input.features
          .filter((f) => f.companyName)
          .map((f) => [normalizeCompanyName(f.companyName!), f.symbol.toUpperCase()] as const),
      ),
    };

    const causes: unknown[] = [];
    for (const provider of ordered) {
      try {
        const completion = await provider.complete({ system, user, maxTokens: opts.maxTokens });
        const result = validatePicksResult(extractJsonObject(completion.text), guard);
        return { ...result, provider: provider.name, model: completion.model };
      } catch (err) {
        causes.push(err);
      }
    }
    throw new LlmError("all LLM providers failed to produce valid picks", causes);
  };
}
