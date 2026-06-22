import { describe, it, expect } from "vitest";
import {
  evaluateHolding,
  evaluateHoldings,
  resolveThresholds,
  PROFILE_THRESHOLDS,
} from "../ruleEngine.js";
import type { Holding, QuoteLike } from "../types.js";

const q = (symbol: string, price: number, changePercent?: number): QuoteLike => ({
  symbol,
  price,
  changePercent,
  asOf: "2026-06-21",
});

describe("resolveThresholds", () => {
  it("derives prices from persona defaults", () => {
    const t = resolveThresholds({ symbol: "AAPL", costBasis: 100 }, { profile: "neutral" });
    expect(t.targetPrice).toBeCloseTo(120, 6); // +20%
    expect(t.stopLossPrice).toBeCloseTo(90, 6); // -10%
  });
  it("holding overrides beat persona/defaults", () => {
    const t = resolveThresholds(
      { symbol: "AAPL", costBasis: 100, targetReturnPct: 50, stopLossPct: 25 },
      { profile: "conservative" },
    );
    expect(t.targetPrice).toBeCloseTo(150, 6);
    expect(t.stopLossPrice).toBeCloseTo(75, 6);
  });
  it("absolute price overrides beat percentages", () => {
    const t = resolveThresholds({ symbol: "AAPL", costBasis: 100, targetPrice: 111, stopLossPrice: 88 });
    expect(t.targetPrice).toBe(111);
    expect(t.stopLossPrice).toBe(88);
  });
  it("exposes the canonical persona thresholds", () => {
    expect(PROFILE_THRESHOLDS.aggressive).toEqual({ target: 40, stop: 20 });
  });
});

describe("evaluateHolding", () => {
  const h: Holding = { symbol: "AAPL", costBasis: 100 };

  it("emits target_reached (action) when price hits the target", () => {
    const a = evaluateHolding(h, q("AAPL", 120), { profile: "neutral" })!;
    expect(a.kind).toBe("target_reached");
    expect(a.severity).toBe("action");
    expect(a.returnPct).toBe(20);
    expect(a.note).toContain("목표가 도달");
    expect(a.note).toContain("AAPL");
  });

  it("emits stop_loss (action) when price hits the stop", () => {
    const a = evaluateHolding(h, q("AAPL", 90), { profile: "neutral" })!;
    expect(a.kind).toBe("stop_loss");
    expect(a.severity).toBe("action");
    expect(a.returnPct).toBe(-10);
    expect(a.note).toContain("손절선 도달");
  });

  it("emits approaching_target (info) just under the target", () => {
    const a = evaluateHolding(h, q("AAPL", 118), { profile: "neutral", nearThresholdPct: 2 })!;
    expect(a.kind).toBe("approaching_target");
    expect(a.severity).toBe("info");
    expect(a.distanceToThresholdPct).toBeCloseTo((120 / 118 - 1) * 100, 1);
  });

  it("emits approaching_stop (info) just above the stop", () => {
    const a = evaluateHolding(h, q("AAPL", 91.5), { profile: "neutral", nearThresholdPct: 2 })!;
    expect(a.kind).toBe("approaching_stop");
    expect(a.severity).toBe("info");
  });

  it("returns null in the neutral zone", () => {
    expect(evaluateHolding(h, q("AAPL", 105), { profile: "neutral", nearThresholdPct: 2 })).toBeNull();
  });

  it("nearThresholdPct=0 disables approaching alerts", () => {
    expect(evaluateHolding(h, q("AAPL", 119.5), { profile: "neutral", nearThresholdPct: 0 })).toBeNull();
  });

  it("persona changes the trigger point", () => {
    // price 110: conservative target (+10%) is reached; neutral (+20%) is not.
    expect(evaluateHolding(h, q("AAPL", 110), { profile: "conservative" })?.kind).toBe("target_reached");
    expect(evaluateHolding(h, q("AAPL", 110), { profile: "neutral", nearThresholdPct: 0 })).toBeNull();
  });

  it("appends today's change to the note when provided", () => {
    const a = evaluateHolding(h, q("AAPL", 120, 1.23), { profile: "neutral" })!;
    expect(a.note).toContain("오늘 +1.23%");
  });

  it("returns null for an invalid cost basis", () => {
    expect(evaluateHolding({ symbol: "X", costBasis: 0 }, q("X", 10))).toBeNull();
    expect(evaluateHolding({ symbol: "X", costBasis: -5 }, q("X", 10))).toBeNull();
  });
});

describe("evaluateHoldings", () => {
  const holdings: Holding[] = [
    { symbol: "AAPL", costBasis: 100 }, // → target at 120
    { symbol: "MSFT", costBasis: 100 }, // → stop at 90
    { symbol: "NVDA", costBasis: 100 }, // neutral zone
  ];

  it("evaluates a portfolio against a quote map and orders actions first", () => {
    const alerts = evaluateHoldings(
      holdings,
      { AAPL: q("AAPL", 121), MSFT: q("MSFT", 89), NVDA: q("NVDA", 103) },
      { profile: "neutral", nearThresholdPct: 0 },
    );
    expect(alerts.map((a) => a.kind).sort()).toEqual(["stop_loss", "target_reached"]);
    expect(alerts.every((a) => a.severity === "action")).toBe(true);
  });

  it("skips holdings that have no matching quote", () => {
    const alerts = evaluateHoldings([{ symbol: "AAPL", costBasis: 100 }], [q("MSFT", 200)]);
    expect(alerts).toHaveLength(0);
  });

  it("accepts a quotes array as well as a map", () => {
    const alerts = evaluateHoldings([{ symbol: "AAPL", costBasis: 100 }], [q("AAPL", 130)], {
      profile: "neutral",
    });
    expect(alerts[0]!.kind).toBe("target_reached");
  });
});
