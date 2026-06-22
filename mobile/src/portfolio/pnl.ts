/**
 * Deterministic local P&L math (SPEC Task 7: "Deterministic local P&L math").
 *
 * Pure functions, no I/O, no LLM. Return % needs only cost basis + current price;
 * value/gain totals additionally need quantity. Holdings missing a price (quote
 * unavailable) or quantity are handled explicitly rather than silently zeroed.
 */

import type { Holding } from "./types";

export interface HoldingPnL {
  id: string;
  symbol: string;
  costBasis: number;
  quantity?: number;
  price: number | null;
  /** Return vs cost basis, in % — needs a price. */
  returnPct: number | null;
  /** Per-share gain — needs a price. */
  gainPerShare: number | null;
  /** quantity * costBasis — needs a quantity. */
  totalCost: number | null;
  /** quantity * price — needs price + quantity. */
  marketValue: number | null;
  /** marketValue - totalCost — needs price + quantity. */
  totalGain: number | null;
  /** True when a current price was available. */
  priced: boolean;
}

export interface PortfolioTotals {
  /** Sum of cost for holdings counted in the totals (priced + has quantity). */
  totalCost: number;
  totalValue: number;
  totalGain: number;
  /** Portfolio return %, or null when nothing is countable. */
  totalReturnPct: number | null;
  /** Holdings included in the value/gain totals. */
  countedHoldings: number;
  /** Holdings excluded because they lack a price and/or quantity. */
  uncountedHoldings: number;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Compute P&L for one holding given an optional current price. */
export function computeHoldingPnL(holding: Holding, price?: number | null): HoldingPnL {
  const cost = holding.costBasis;
  const qty = holding.quantity;
  const hasPrice = price != null && Number.isFinite(price) && price > 0;
  const hasCost = Number.isFinite(cost) && cost > 0;

  const returnPct = hasPrice && hasCost ? round2(((price! - cost) / cost) * 100) : null;
  const gainPerShare = hasPrice && hasCost ? round2(price! - cost) : null;
  const hasQty = qty != null && Number.isFinite(qty) && qty > 0;
  const totalCost = hasQty && hasCost ? round2(cost * qty!) : null;
  const marketValue = hasQty && hasPrice ? round2(price! * qty!) : null;
  const totalGain =
    marketValue != null && totalCost != null ? round2(marketValue - totalCost) : null;

  return {
    id: holding.id,
    symbol: holding.symbol,
    costBasis: cost,
    quantity: qty,
    price: hasPrice ? price! : null,
    returnPct,
    gainPerShare,
    totalCost,
    marketValue,
    totalGain,
    priced: hasPrice,
  };
}

/** Compute per-holding rows + portfolio totals from a symbol→price map. */
export function computePortfolioPnL(
  holdings: Holding[],
  priceBySymbol: Record<string, number | null | undefined>,
): { rows: HoldingPnL[]; totals: PortfolioTotals } {
  const rows = holdings.map((h) => computeHoldingPnL(h, priceBySymbol[h.symbol.toUpperCase()]));

  let totalCost = 0;
  let totalValue = 0;
  let counted = 0;
  for (const r of rows) {
    if (r.totalCost != null && r.marketValue != null) {
      totalCost += r.totalCost;
      totalValue += r.marketValue;
      counted++;
    }
  }
  const totalGain = round2(totalValue - totalCost);
  return {
    rows,
    totals: {
      totalCost: round2(totalCost),
      totalValue: round2(totalValue),
      totalGain,
      totalReturnPct: totalCost > 0 ? round2((totalGain / totalCost) * 100) : null,
      countedHoldings: counted,
      uncountedHoldings: rows.length - counted,
    },
  };
}
