import { describe, it, expect } from "vitest";
import {
  TimingSignalStore,
  MarketBriefStore,
  timingSignalId,
  marketBriefId,
} from "../store.js";
import type { TimingSignal, DailyMarketBrief } from "../types.js";

function sig(ticker: string, action: TimingSignal["action"] = "buy"): TimingSignal {
  return {
    ticker,
    action,
    confidence: 0.7,
    oneLineReason: "근거 한 줄",
    contextNewsIds: [],
    evaluatedAt: "2024-06-21T13:00:00.000Z",
    source: "dailyBatch",
  };
}

const BRIEF: DailyMarketBrief = {
  market: "US",
  date: "2024-06-21",
  headlineSummary: "반도체 강세",
  sectorSignals: [{ sector: "반도체", direction: "strong", reason: "순매수" }],
  linkedTickers: ["AAPL"],
  sourceUrls: ["https://finance.yahoo.com/n/1"],
  generatedAt: "2024-06-21T13:00:00.000Z",
};

describe("id builders", () => {
  it("are deterministic and source-scoped", () => {
    expect(timingSignalId("US", "2024-06-21", "aapl", "dailyBatch")).toBe("US:2024-06-21:AAPL:dailyBatch");
    expect(marketBriefId("KR", "2024-06-21")).toBe("KR:2024-06-21");
  });
});

describe("TimingSignalStore (append-only)", () => {
  it("records signals and is idempotent per id", () => {
    const store = new TimingSignalStore({ file: null });
    const first = store.record("US", "2024-06-21", [sig("AAPL"), sig("MSFT")]);
    expect(first).toHaveLength(2);
    // Re-recording the same day appends nothing (idempotent).
    const second = store.record("US", "2024-06-21", [sig("AAPL"), sig("MSFT")]);
    expect(second).toHaveLength(0);
    expect(store.forDate("US", "2024-06-21")).toHaveLength(2);
    expect(store.forDate("US", "2024-06-21")[0]!.id).toBe("US:2024-06-21:AAPL:dailyBatch");
  });

  it("separates by date and market", () => {
    const store = new TimingSignalStore({ file: null });
    store.record("US", "2024-06-21", [sig("AAPL")]);
    store.record("US", "2024-06-22", [sig("AAPL")]);
    store.record("KR", "2024-06-21", [sig("005930")]);
    expect(store.forDate("US", "2024-06-21")).toHaveLength(1);
    expect(store.forDate("US", "2024-06-22")).toHaveLength(1);
    expect(store.forDate("KR", "2024-06-21")).toHaveLength(1);
  });
});

describe("MarketBriefStore (append-only)", () => {
  it("records one brief per market+date, idempotent", () => {
    const store = new MarketBriefStore({ file: null });
    expect(store.record(BRIEF)).toHaveLength(1);
    expect(store.record(BRIEF)).toHaveLength(0); // same id → no double-log
    const got = store.get("US", "2024-06-21");
    expect(got?.headlineSummary).toBe("반도체 강세");
    expect(got?.sourceUrls).toEqual(["https://finance.yahoo.com/n/1"]);
  });
});
