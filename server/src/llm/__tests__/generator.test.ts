import { describe, it, expect, vi } from "vitest";
import { makePicksGenerator, orderProviders } from "../generator.js";
import { LlmError, type LlmProvider } from "../types.js";
import type { TickerFeatures } from "../../features/indicators.js";

function feat(symbol: string, companyName?: string): TickerFeatures {
  return {
    symbol,
    companyName,
    lastClose: 200,
    asOf: "2024-06-21",
    return1W: 1,
    return1M: 2,
    return3M: 3,
    return1Y: 10,
    return5Y: 100,
    annualizedVolatilityPct: 25,
    maxDrawdownPct: -30,
    sma50: 190,
    sma200: 180,
    priceVsSma200Pct: 11,
    aboveSma200: true,
    recentTrendPct: 2,
    dataPoints: 1255,
  };
}

// The universe must cover every symbol the stub returns — the generator now
// enforces picks ⊆ provided universe (SPEC §3.2).
const FEATURES: TickerFeatures[] = [
  feat("AAPL", "Apple"),
  feat("MSFT", "Microsoft"),
  feat("NVDA", "NVIDIA"),
];

const VALID_JSON = JSON.stringify({
  picks: [
    { symbol: "AAPL", rationale: "r1", confidence: "high", risk: "low" },
    { symbol: "MSFT", rationale: "r2", confidence: "medium", risk: "medium" },
    { symbol: "NVDA", rationale: "r3", confidence: "high", risk: "high" },
  ],
  marketContext: "견조",
});

function stubProvider(
  name: string,
  impl: { available?: boolean; result?: string; throws?: boolean; model?: string },
): LlmProvider {
  return {
    name,
    isAvailable: () => impl.available ?? true,
    complete: vi.fn(async () => {
      if (impl.throws) throw new Error(`${name} failed`);
      return { text: impl.result ?? VALID_JSON, model: impl.model ?? `${name}-model` };
    }),
  };
}

describe("orderProviders", () => {
  it("prefers Anthropic below the load threshold", () => {
    const a = stubProvider("anthropic", {});
    const g = stubProvider("gemini", {});
    expect(orderProviders([g, a], 0.1, 0.8).map((p) => p.name)).toEqual(["anthropic", "gemini"]);
  });
  it("prefers Gemini at/above the load threshold (cost scaling)", () => {
    const a = stubProvider("anthropic", {});
    const g = stubProvider("gemini", {});
    expect(orderProviders([a, g], 0.9, 0.8).map((p) => p.name)).toEqual(["gemini", "anthropic"]);
  });
  it("excludes unavailable providers", () => {
    const a = stubProvider("anthropic", { available: false });
    const g = stubProvider("gemini", {});
    expect(orderProviders([a, g], 0, 0.8).map((p) => p.name)).toEqual(["gemini"]);
  });
});

describe("makePicksGenerator", () => {
  const input = { features: FEATURES, asOfDate: "2024-06-21", marketLabel: "미국" };

  it("returns validated picks tagged with the producing provider/model", async () => {
    const gen = makePicksGenerator({ providers: [stubProvider("anthropic", {})] });
    const r = await gen(input);
    expect(r.provider).toBe("anthropic");
    expect(r.model).toBe("anthropic-model");
    expect(r.picks).toHaveLength(3);
  });

  it("falls back to Gemini when Anthropic throws", async () => {
    const a = stubProvider("anthropic", { throws: true });
    const g = stubProvider("gemini", {});
    const gen = makePicksGenerator({ providers: [a, g] });
    const r = await gen(input);
    expect(r.provider).toBe("gemini");
    expect(a.complete).toHaveBeenCalledOnce();
  });

  it("falls back when the primary returns invalid JSON", async () => {
    const a = stubProvider("anthropic", { result: "not json at all" });
    const g = stubProvider("gemini", {});
    const gen = makePicksGenerator({ providers: [a, g] });
    const r = await gen(input);
    expect(r.provider).toBe("gemini");
  });

  it("throws LlmError when every provider fails", async () => {
    const gen = makePicksGenerator({
      providers: [stubProvider("anthropic", { throws: true }), stubProvider("gemini", { throws: true })],
    });
    await expect(gen(input)).rejects.toBeInstanceOf(LlmError);
  });

  it("throws LlmError when no provider is configured", async () => {
    const gen = makePicksGenerator({ providers: [stubProvider("anthropic", { available: false })] });
    await expect(gen(input)).rejects.toThrow(/No LLM provider/);
  });

  it("recovers a glitched symbol back to a universe ticker by company name", async () => {
    const glitched = JSON.stringify({
      picks: [
        { symbol: "AVAPL_PLACEHOLDER", companyName: "Apple", rationale: "r", confidence: "high", risk: "low" },
        { symbol: "MSFT", rationale: "r2", confidence: "medium", risk: "medium" },
        { symbol: "NVDA", rationale: "r3", confidence: "high", risk: "high" },
      ],
      marketContext: "견조",
    });
    const gen = makePicksGenerator({ providers: [stubProvider("anthropic", { result: glitched })] });
    const r = await gen(input);
    expect(r.picks.map((p) => p.symbol)).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("drops an out-of-universe symbol that cannot be recovered", async () => {
    const offUniverse = JSON.stringify({
      picks: [
        { symbol: "TSLA", companyName: "Tesla", rationale: "off-universe", confidence: "high", risk: "high" },
        { symbol: "AAPL", rationale: "r", confidence: "high", risk: "low" },
        { symbol: "MSFT", rationale: "r2", confidence: "medium", risk: "medium" },
        { symbol: "NVDA", rationale: "r3", confidence: "high", risk: "high" },
      ],
      marketContext: "x",
    });
    const gen = makePicksGenerator({ providers: [stubProvider("anthropic", { result: offUniverse })] });
    const r = await gen(input);
    expect(r.picks.map((p) => p.symbol)).toEqual(["AAPL", "MSFT", "NVDA"]); // TSLA dropped
  });
});
