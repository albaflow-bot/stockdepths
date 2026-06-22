import { describe, it, expect } from "vitest";
import { extractJsonObject, validatePicksResult, LlmError } from "../types.js";

const VALID = {
  picks: [
    { symbol: "aapl", rationale: "5년 추세 견조", confidence: "high", risk: "low" },
    { symbol: "MSFT", rationale: "최근 모멘텀 강함", confidence: "medium", risk: "medium" },
    { symbol: "NVDA", rationale: "변동성 높지만 추세 강함", confidence: "high", risk: "high" },
  ],
  marketContext: "전반적으로 견조한 흐름.",
};

describe("extractJsonObject", () => {
  it("parses a bare JSON object", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips markdown fences and surrounding prose", () => {
    const text = 'Here you go:\n```json\n{"picks":[],"marketContext":"x"}\n```\nThanks!';
    expect(extractJsonObject(text)).toEqual({ picks: [], marketContext: "x" });
  });
  it("handles braces inside string values", () => {
    expect(extractJsonObject('{"k":"a{b}c"}')).toEqual({ k: "a{b}c" });
  });
  it("throws when no JSON object is present", () => {
    expect(() => extractJsonObject("no json here")).toThrow(LlmError);
  });
});

describe("validatePicksResult", () => {
  it("normalizes symbols, badges, and keeps marketContext", () => {
    const r = validatePicksResult(VALID);
    expect(r.picks).toHaveLength(3);
    expect(r.picks[0]!.symbol).toBe("AAPL"); // uppercased
    expect(r.picks[0]!.confidence).toBe("high");
    expect(r.marketContext).toContain("견조");
  });

  it("coerces unknown/Korean badge values to enum levels", () => {
    const r = validatePicksResult({
      ...VALID,
      picks: VALID.picks.map((p) => ({ ...p, confidence: "공격", risk: "안정" })),
    });
    expect(r.picks[0]!.confidence).toBe("high");
    expect(r.picks[0]!.risk).toBe("low");
  });

  it("drops malformed picks and clamps to at most 5", () => {
    const many = {
      picks: [
        ...Array.from({ length: 7 }, (_, i) => ({
          symbol: `S${i}`,
          rationale: "근거",
          confidence: "medium",
          risk: "medium",
        })),
        { rationale: "심볼 없음" }, // dropped
      ],
      marketContext: "x",
    };
    const r = validatePicksResult(many);
    expect(r.picks).toHaveLength(5);
  });

  it("throws when fewer than 3 valid picks remain", () => {
    expect(() =>
      validatePicksResult({ picks: [{ symbol: "A", rationale: "r" }], marketContext: "x" }),
    ).toThrow(/at least 3/);
  });

  it("supplies a default marketContext when missing", () => {
    const r = validatePicksResult({ picks: VALID.picks });
    expect(r.marketContext).toBeTruthy();
  });

  describe("symbol guard", () => {
    const guard = {
      allowed: new Set(["AAPL", "MSFT", "NVDA"]),
      byName: new Map([
        ["apple", "AAPL"],
        ["microsoft", "MSFT"],
        ["nvidia", "NVDA"],
      ]),
    };

    it("recovers a glitched/placeholder symbol by company name", () => {
      const r = validatePicksResult(
        {
          picks: [
            { symbol: "AVAPL_PLACEHOLDER", companyName: "Apple Inc.", rationale: "r", confidence: "high", risk: "low" },
            { symbol: "MSFT", rationale: "r2", confidence: "medium", risk: "medium" },
            { symbol: "NVDA", rationale: "r3", confidence: "high", risk: "high" },
          ],
          marketContext: "x",
        },
        guard,
      );
      expect(r.picks.map((p) => p.symbol)).toEqual(["AAPL", "MSFT", "NVDA"]);
    });

    it("drops out-of-universe symbols with no name match", () => {
      const r = validatePicksResult(
        {
          picks: [
            { symbol: "FAKE", companyName: "Unknown Co", rationale: "r", confidence: "high", risk: "low" },
            { symbol: "AAPL", rationale: "r", confidence: "high", risk: "low" },
            { symbol: "MSFT", rationale: "r2", confidence: "medium", risk: "medium" },
            { symbol: "NVDA", rationale: "r3", confidence: "high", risk: "high" },
          ],
          marketContext: "x",
        },
        guard,
      );
      expect(r.picks.map((p) => p.symbol)).toEqual(["AAPL", "MSFT", "NVDA"]);
    });

    it("throws when dropping out-of-universe picks falls below the minimum", () => {
      expect(() =>
        validatePicksResult(
          {
            picks: [
              { symbol: "FAKE1", rationale: "r", confidence: "high", risk: "low" },
              { symbol: "FAKE2", rationale: "r", confidence: "high", risk: "low" },
              { symbol: "AAPL", rationale: "r", confidence: "high", risk: "low" },
            ],
            marketContext: "x",
          },
          guard,
        ),
      ).toThrow(/at least 3/);
    });
  });
});
