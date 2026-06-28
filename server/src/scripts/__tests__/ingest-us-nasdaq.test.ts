import { describe, it, expect } from "vitest";
import { parseNasdaqRow, type NasdaqRow } from "../ingest-us-nasdaq.js";

const ASOF = "2026-06-28";

describe("parseNasdaqRow", () => {
  it("parses a real-shaped row: last/change_pct/volume/turnover/market_cap", () => {
    // Real Nasdaq screener keys — renaming any (e.g. marketCap→market_cap) must break this.
    const row: NasdaqRow = {
      symbol: "aapl",
      lastsale: "$196.31",
      pctchange: "-1.352%",
      volume: "34,552,588",
      marketCap: "4,750,702,000,000",
    };
    const rec = parseNasdaqRow(row, "NASDAQ", ASOF);
    expect(rec).not.toBeNull();
    expect(rec!.market).toBe("NASDAQ");
    expect(rec!.code).toBe("AAPL"); // uppercased + trimmed
    expect(rec!.asof).toBe(ASOF);
    expect(rec!.last).toBe(196.31);
    expect(rec!.change_pct).toBe(-1.352);
    expect(rec!.volume).toBe(34552588);
    expect(rec!.turnover).toBeCloseTo(196.31 * 34552588, 2);
    expect(rec!.market_cap).toBe(4750702000000);
    // history-derived metrics are null in a snapshot
    expect(rec!.rvol).toBeNull();
    expect(rec!.rsi14).toBeNull();
  });

  it("maps NYSE market through (exchange mapping responsibility lives in caller)", () => {
    const row: NasdaqRow = { symbol: "GE", lastsale: "$172.00", pctchange: "0.5%", volume: "1,000" };
    const rec = parseNasdaqRow(row, "NYSE", ASOF);
    expect(rec!.market).toBe("NYSE");
    expect(rec!.market_cap).toBeNull(); // missing marketCap → null
  });

  it("skips zero-volume rows (PREOPEN guard) → null", () => {
    const row: NasdaqRow = { symbol: "DEAD", lastsale: "$10.00", pctchange: "0%", volume: "0" };
    expect(parseNasdaqRow(row, "NASDAQ", ASOF)).toBeNull();
  });

  it("skips rows with missing volume → null", () => {
    const row: NasdaqRow = { symbol: "NOVOL", lastsale: "$10.00", pctchange: "0%" };
    expect(parseNasdaqRow(row, "NASDAQ", ASOF)).toBeNull();
  });

  it("skips rows with missing symbol → null", () => {
    const row: NasdaqRow = { lastsale: "$10.00", volume: "100" };
    expect(parseNasdaqRow(row, "NASDAQ", ASOF)).toBeNull();
  });
});
