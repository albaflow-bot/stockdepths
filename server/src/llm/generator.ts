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

/** Explicit provider preference, overriding the load-based default. */
export type PrimaryProvider = "anthropic" | "gemini";

export interface GeneratorOptions {
  /** Current server load 0..1 (e.g. queue depth / capacity). Default 0. */
  load?: number;
  /** Load at/above which Gemini is preferred to shed cost. Default 0.8. */
  loadThreshold?: number;
  /**
   * Force a primary provider regardless of load. Set to "gemini" to run on the
   * free tier (one call/day stays well within Gemini's free quota); the other
   * provider, if configured, still acts as a failover. When unset, the
   * load-based policy applies (Anthropic-first below threshold).
   */
  primary?: PrimaryProvider;
  maxTokens?: number;
  /** Override the provider set (tests inject stubs). */
  providers?: LlmProvider[];
}

/**
 * Order providers for this run. Pure + exported so the selection policy is
 * directly testable. Only the available providers are returned. An explicit
 * `primary` wins over the load-based default; the non-primary provider is kept as
 * a failover.
 */
export function orderProviders(
  providers: LlmProvider[],
  load: number,
  loadThreshold: number,
  primary?: PrimaryProvider,
): LlmProvider[] {
  const available = providers.filter((p) => p.isAvailable());
  const byName = (n: string) => available.filter((p) => p.name === n);
  const anthropic = byName("anthropic");
  const gemini = byName("gemini");
  const rest = available.filter((p) => p.name !== "anthropic" && p.name !== "gemini");
  let primaryFirst: LlmProvider[];
  if (primary === "gemini") {
    primaryFirst = [...gemini, ...anthropic];
  } else if (primary === "anthropic") {
    primaryFirst = [...anthropic, ...gemini];
  } else {
    primaryFirst = load >= loadThreshold ? [...gemini, ...anthropic] : [...anthropic, ...gemini];
  }
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
  const primary = opts.primary;

  return async (input) => {
    const ordered = orderProviders(providers, load, loadThreshold, primary);
    if (ordered.length === 0) {
      throw new LlmError(
        "No LLM provider is configured. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY (paid).",
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
