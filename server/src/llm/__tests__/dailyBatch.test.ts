import { describe, it, expect, vi } from "vitest";
import {
  makeDailyBatchGenerator,
  parseDailyBatch,
  type DailyBatchGenerateInput,
} from "../dailyBatch.js";
import { normalizeCompanyName, type LlmProvider, type SymbolGuard } from "../types.js";
import type { TickerFeatures } from "../../features/indicators.js";

function feat(symbol: string, companyName?: string): TickerFeatures {
  return {
    symbol,
    companyName,
    lastClose: 100,
    asOf: "2024-06-21",
    return1W: 1,
    return1M: 2,
    return3M: 3,
    return1Y: 10,
    return5Y: 50,
    annualizedVolatilityPct: 20,
    maxDrawdownPct: -15,
    sma50: 100,
    sma200: 90,
    priceVsSma200Pct: 5,
    aboveSma200: true,
    recentTrendPct: 3,
    dataPoints: 260,
  };
}

const FEATURES = [feat("AAPL", "Apple"), feat("MSFT", "Microsoft"), feat("NVDA", "Nvidia")];

const INPUT: DailyBatchGenerateInput = {
  features: FEATURES,
  asOfDate: "2024-06-21",
  marketLabel: "미국(나스닥/S&P)",
  market: "US",
  evaluatedAt: "2024-06-21T13:00:00.000Z",
  context: {
    indices: [{ name: "S&P 500", changePercent: 1.2 }],
    rankedTickers: [
      { ticker: "AMD", companyName: "AMD", category: "gainers", changePercent: 6 },
      { ticker: "TSLA", companyName: "Tesla", category: "popular", changePercent: -4 },
    ],
    news: [
      { title: "Apple unveils new chip", url: "https://finance.yahoo.com/n/1", tickers: ["AAPL"], kind: "news" },
      { title: "8-K filing", url: "https://www.sec.gov/f/2", tickers: ["MSFT"], kind: "disclosure" },
    ],
  },
};

function guardFor(features: TickerFeatures[]): SymbolGuard {
  return {
    allowed: new Set(features.map((f) => f.symbol.toUpperCase())),
    byName: new Map(
      features.filter((f) => f.companyName).map((f) => [normalizeCompanyName(f.companyName!), f.symbol.toUpperCase()]),
    ),
  };
}

const MODEL_JSON = JSON.stringify({
  picks: [
    { symbol: "AAPL", companyName: "Apple", rationale: "5년 추세 상단", confidence: "high", risk: "low", timing: { action: "buy", reason: "추세 상단 + 신제품 모멘텀", confidence: 0.8 } },
    { symbol: "MSFT", rationale: "안정적 성장", confidence: "medium", risk: "medium", timing: { action: "hold", reason: "박스권 유지", confidence: 0.6 } },
    { symbol: "NVDA", rationale: "고평가 주의", confidence: "medium", risk: "high" }, // no timing → fallback
  ],
  marketContext: "기술주 강세",
  brief: {
    headlineSummary: "반도체 강세 주도",
    sectorSignals: [
      { sector: "반도체", direction: "strong", reason: "외국인 순매수" },
      { sector: "자동차", direction: "weak", reason: "수요 둔화" },
    ],
    linkedTickers: ["AAPL", "FAKE"], // FAKE not in known set → dropped
  },
  signals: [
    { ticker: "AMD", action: "buy", reason: "거래량 급증", confidence: 0.7 },
    { ticker: "TSLA", action: "watch", reason: "변동성 확대", confidence: 0.5 },
    { ticker: "GHOST", action: "buy", reason: "환상", confidence: 0.9 }, // not in known → dropped
  ],
});

describe("parseDailyBatch", () => {
  it("extracts picks + per-pick signals (with rationale fallback)", () => {
    const r = parseDailyBatch(MODEL_JSON, INPUT, guardFor(FEATURES));
    expect(r.picks.map((p) => p.symbol)).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(r.pickSignals).toHaveLength(3);
    const aapl = r.pickSignals.find((s) => s.ticker === "AAPL")!;
    expect(aapl.action).toBe("buy");
    expect(aapl.confidence).toBe(0.8);
    expect(aapl.source).toBe("dailyBatch");
    expect(aapl.evaluatedAt).toBe(INPUT.evaluatedAt);
    // NVDA had no timing → action defaults watch, reason falls back to its rationale (근거 필수)
    const nvda = r.pickSignals.find((s) => s.ticker === "NVDA")!;
    expect(nvda.action).toBe("watch");
    expect(nvda.oneLineReason).toBe("고평가 주의");
  });

  it("produces ranked signals only for known TOP/popular tickers (anti-hallucination)", () => {
    const r = parseDailyBatch(MODEL_JSON, INPUT, guardFor(FEATURES));
    expect(r.rankedSignals.map((s) => s.ticker).sort()).toEqual(["AMD", "TSLA"]);
    expect(r.rankedSignals.find((s) => s.ticker === "GHOST")).toBeUndefined();
  });

  it("builds the brief, drops unknown linkedTickers, and stamps verifiable source URLs", () => {
    const r = parseDailyBatch(MODEL_JSON, INPUT, guardFor(FEATURES));
    expect(r.brief.headlineSummary).toContain("반도체");
    expect(r.brief.sectorSignals).toHaveLength(2);
    expect(r.brief.linkedTickers).toEqual(["AAPL"]); // FAKE dropped
    // URLs are stamped by code from the gated news, not the model (박제).
    expect(r.brief.sourceUrls).toEqual(["https://finance.yahoo.com/n/1", "https://www.sec.gov/f/2"]);
    expect(r.brief.market).toBe("US");
    expect(r.brief.date).toBe("2024-06-21");
  });

  it("every signal carries a non-empty one-line reason (근거 없는 신호 금지)", () => {
    const r = parseDailyBatch(MODEL_JSON, INPUT, guardFor(FEATURES));
    for (const s of [...r.pickSignals, ...r.rankedSignals]) {
      expect(s.oneLineReason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("makeDailyBatchGenerator", () => {
  it("makes ONE provider call and returns picks + brief + signals", async () => {
    const complete = vi.fn(async () => ({ text: MODEL_JSON, model: "claude-sonnet-4-6" }));
    const provider: LlmProvider = { name: "anthropic", isAvailable: () => true, complete };
    const gen = makeDailyBatchGenerator({ providers: [provider] });

    const r = await gen(INPUT);
    expect(complete).toHaveBeenCalledOnce(); // 추가 호출 0 — single oneshot
    expect(r.provider).toBe("anthropic");
    expect(r.picks).toHaveLength(3);
    expect(r.brief.headlineSummary).toContain("반도체");
    expect(r.pickSignals.length + r.rankedSignals.length).toBe(5);
  });

  it("falls through to the next provider on failure", async () => {
    const bad: LlmProvider = { name: "anthropic", isAvailable: () => true, complete: vi.fn(async () => ({ text: "not json", model: "x" })) };
    const good: LlmProvider = { name: "gemini", isAvailable: () => true, complete: vi.fn(async () => ({ text: MODEL_JSON, model: "gemini-2.0" })) };
    const gen = makeDailyBatchGenerator({ providers: [bad, good], primary: "anthropic" });
    const r = await gen(INPUT);
    expect(r.provider).toBe("gemini");
  });
});
