import { describe, it, expect } from "vitest";
import { computeHoldingPnL, computePortfolioPnL } from "../pnl";
import type { Holding } from "../types";

const h = (over: Partial<Holding>): Holding => ({
  id: over.id ?? "h1",
  symbol: over.symbol ?? "AAPL",
  costBasis: over.costBasis ?? 100,
  quantity: over.quantity,
  createdAt: "2026-06-21T00:00:00Z",
});

describe("computeHoldingPnL", () => {
  it("computes return %, value, and gain when price + quantity are present", () => {
    const r = computeHoldingPnL(h({ costBasis: 100, quantity: 10 }), 120);
    expect(r.returnPct).toBe(20);
    expect(r.gainPerShare).toBe(20);
    expect(r.totalCost).toBe(1000);
    expect(r.marketValue).toBe(1200);
    expect(r.totalGain).toBe(200);
    expect(r.priced).toBe(true);
  });

  it("computes return % without quantity (value/gain stay null)", () => {
    const r = computeHoldingPnL(h({ costBasis: 200 }), 180);
    expect(r.returnPct).toBe(-10);
    expect(r.totalCost).toBeNull();
    expect(r.marketValue).toBeNull();
    expect(r.totalGain).toBeNull();
  });

  it("returns nulls (not zeros) when no price is available", () => {
    const r = computeHoldingPnL(h({ costBasis: 100, quantity: 5 }), undefined);
    expect(r.priced).toBe(false);
    expect(r.returnPct).toBeNull();
    expect(r.marketValue).toBeNull();
  });

  it("guards against a non-positive cost basis", () => {
    const r = computeHoldingPnL(h({ costBasis: 0, quantity: 5 }), 100);
    expect(r.returnPct).toBeNull();
  });
});

describe("computePortfolioPnL", () => {
  it("aggregates only holdings that have both price and quantity", () => {
    const holdings = [
      h({ id: "a", symbol: "AAPL", costBasis: 100, quantity: 10 }), // +20% → +200
      h({ id: "b", symbol: "MSFT", costBasis: 200, quantity: 5 }), // -10% → -100
      h({ id: "c", symbol: "NVDA", costBasis: 50 }), // no qty → excluded
      h({ id: "d", symbol: "TSLA", costBasis: 100, quantity: 3 }), // no quote → excluded
    ];
    const prices = { AAPL: 120, MSFT: 180, NVDA: 80 };
    const { rows, totals } = computePortfolioPnL(holdings, prices);

    expect(rows).toHaveLength(4);
    expect(totals.countedHoldings).toBe(2); // AAPL + MSFT
    expect(totals.uncountedHoldings).toBe(2); // NVDA (no qty) + TSLA (no quote)
    expect(totals.totalCost).toBe(2000); // 1000 + 1000
    expect(totals.totalValue).toBe(2100); // 1200 + 900
    expect(totals.totalGain).toBe(100);
    expect(totals.totalReturnPct).toBe(5);
  });

  it("returns a null portfolio return when nothing is countable", () => {
    const { totals } = computePortfolioPnL([h({ costBasis: 100 })], {});
    expect(totals.countedHoldings).toBe(0);
    expect(totals.totalReturnPct).toBeNull();
  });
});
