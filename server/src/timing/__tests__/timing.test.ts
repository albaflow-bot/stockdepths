import { describe, it, expect } from "vitest";
import {
  clampConfidence,
  validateTimingSignal,
  validateDailyMarketBrief,
} from "../types.js";

const AT = "2026-06-24T00:00:00.000Z";

describe("clampConfidence", () => {
  it("keeps an in-range value", () => {
    expect(clampConfidence(0.73)).toBe(0.73);
  });
  it("clamps out-of-range values into [0,1]", () => {
    expect(clampConfidence(-0.4)).toBe(0);
    expect(clampConfidence(2)).toBe(1);
  });
  it("defaults to 0.5 for non-finite/absent (NOT NULL contract)", () => {
    expect(clampConfidence(undefined)).toBe(0.5);
    expect(clampConfidence("nope")).toBe(0.5);
    expect(clampConfidence(NaN)).toBe(0.5);
  });
});

describe("validateTimingSignal", () => {
  it("normalizes a full signal and upper-cases the ticker", () => {
    const sig = validateTimingSignal(
      {
        ticker: "aapl",
        action: "buy",
        confidence: 0.8,
        oneLineReason: "5년 추세 상단 + 거래량 급증",
        contextNewsIds: ["n1", "n2"],
      },
      AT,
    );
    expect(sig).toEqual({
      ticker: "AAPL",
      action: "buy",
      confidence: 0.8,
      oneLineReason: "5년 추세 상단 + 거래량 급증",
      contextNewsIds: ["n1", "n2"],
      evaluatedAt: AT,
      source: "dailyBatch",
    });
  });

  it("tolerates snake_case keys and Korean action synonyms", () => {
    const sig = validateTimingSignal(
      { symbol: "msft", action: "매도", one_line_reason: "고점 이탈", context_news_ids: ["x"] },
      AT,
    );
    expect(sig?.action).toBe("sell");
    expect(sig?.oneLineReason).toBe("고점 이탈");
    expect(sig?.contextNewsIds).toEqual(["x"]);
  });

  it("clamps confidence and never leaves a signal without a reason", () => {
    const sig = validateTimingSignal({ ticker: "TSLA", confidence: 5 }, AT);
    expect(sig?.confidence).toBe(1);
    expect(sig?.action).toBe("watch");
    expect(sig?.oneLineReason.length).toBeGreaterThan(0);
  });

  it("returns undefined rather than fabricating a ticker", () => {
    expect(validateTimingSignal({ action: "buy" }, AT)).toBeUndefined();
    expect(validateTimingSignal(null, AT)).toBeUndefined();
  });

  it("supports the on-device source", () => {
    const sig = validateTimingSignal({ ticker: "AAPL" }, AT, "onDeviceRule");
    expect(sig?.source).toBe("onDeviceRule");
  });
});

describe("validateDailyMarketBrief", () => {
  it("normalizes a brief and clamps sectors to at most 3", () => {
    const brief = validateDailyMarketBrief(
      {
        headline_summary: "반도체 강세 주도, 코스피 +3.26% 마감",
        sector_signals: [
          { sector: "반도체", direction: "강세", reason: "외국인 순매수" },
          { sector: "2차전지", direction: "weak", reason: "수요 둔화" },
          { sector: "바이오", direction: "강세", reason: "임상 호재" },
          { sector: "초과분", direction: "강세", reason: "drop me" },
        ],
        linked_tickers: ["005930", "000660"],
        source_urls: ["https://dart.fss.or.kr/x"],
      },
      "KR",
      "2026-06-24",
      AT,
    );
    expect(brief.headlineSummary).toContain("반도체 강세");
    expect(brief.sectorSignals).toHaveLength(3);
    expect(brief.sectorSignals[1]?.direction).toBe("weak");
    expect(brief.linkedTickers).toEqual(["005930", "000660"]);
    expect(brief.market).toBe("KR");
    expect(brief.generatedAt).toBe(AT);
  });

  it("falls back to a safe headline when the model omits one (Sane default)", () => {
    const brief = validateDailyMarketBrief({}, "US", "2026-06-24", AT);
    expect(brief.headlineSummary.length).toBeGreaterThan(0);
    expect(brief.sectorSignals).toEqual([]);
    expect(brief.linkedTickers).toEqual([]);
  });
});
