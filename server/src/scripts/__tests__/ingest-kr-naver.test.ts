import { describe, it, expect } from "vitest";
import { parseNaverStock, type NaverStock } from "../ingest-kr-naver.js";

/** Base real-shaped Naver marketValue stock; overridden per case. */
function stock(over: Partial<NaverStock> = {}): NaverStock {
  return {
    itemCode: "005930",
    stockName: "삼성전자",
    stockEndType: "stock",
    closePrice: "358,500",
    fluctuationsRatio: "5.29",
    compareToPreviousPrice: { text: "상승" },
    accumulatedTradingVolume: "34,552,588",
    accumulatedTradingValue: "12,381,294", // 백만원
    marketValueRaw: "1984811587416000",
    localTradedAt: "2026-06-25T16:10:20+09:00",
    ...over,
  };
}

describe("parseNaverStock", () => {
  it("parses a rising stock: code/name/last/volume/turnover(×1e6)/market_cap/asof", () => {
    const parsed = parseNaverStock("KOSPI", stock());
    expect(parsed).not.toBeNull();
    const { master, screen } = parsed!;
    expect(master.market).toBe("KOSPI");
    expect(master.code).toBe("005930");
    expect(master.name_ko).toBe("삼성전자");
    expect(master.is_etf).toBe(false);
    expect(screen).not.toBeNull();
    expect(screen!.asof).toBe("2026-06-25");
    expect(screen!.last).toBe(358500);
    expect(screen!.volume).toBe(34552588);
    // accumulatedTradingValue is in millions of KRW → ×1e6
    expect(screen!.turnover).toBe(12381294 * 1_000_000);
    // market_cap comes from marketValueRaw (raw KRW) — renaming the key must break this.
    expect(screen!.market_cap).toBe(1984811587416000);
  });

  it("rising direction → positive change_pct", () => {
    const { screen } = parseNaverStock("KOSPI", stock({ compareToPreviousPrice: { text: "상승" } }))!;
    expect(screen!.change_pct).toBe(5.29);
  });

  it("falling direction → negative change_pct", () => {
    const { screen } = parseNaverStock("KOSPI", stock({ compareToPreviousPrice: { text: "하락" } }))!;
    expect(screen!.change_pct).toBe(-5.29);
  });

  it("flat direction (보합) → zero change_pct", () => {
    const { screen } = parseNaverStock(
      "KOSPI",
      stock({ fluctuationsRatio: "0.00", compareToPreviousPrice: { text: "보합" } }),
    )!;
    expect(screen!.change_pct).toBe(0);
  });

  it("etf endType → is_etf flag true", () => {
    const { master } = parseNaverStock("KOSPI", stock({ stockEndType: "etf" }))!;
    expect(master.is_etf).toBe(true);
  });

  it("missing turnover (PREOPEN) → master kept, screen null", () => {
    const parsed = parseNaverStock("KOSPI", stock({ accumulatedTradingValue: undefined }))!;
    expect(parsed.master.code).toBe("005930");
    expect(parsed.screen).toBeNull();
  });

  it("zero turnover (PREOPEN) → screen null", () => {
    const parsed = parseNaverStock("KOSPI", stock({ accumulatedTradingValue: "0" }))!;
    expect(parsed.screen).toBeNull();
  });

  it("missing itemCode → null (skip)", () => {
    expect(parseNaverStock("KOSPI", stock({ itemCode: undefined }))).toBeNull();
  });
});
