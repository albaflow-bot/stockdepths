/**
 * Scorecard service — the read API that DERIVES the scorecard from the append-only
 * log (SPEC §3.3: "the scorecard reads from this append-only history, not
 * regenerated").
 *
 * Nothing here is stored. For any `asOf` and period it recomputes each
 * recommendation's realized return from its FROZEN entry price (immutable, from
 * the log) against a fresh price, plus the benchmark return over the same span,
 * and aggregates the four SPEC metrics. Equal-weight buy-and-hold-to-asOf treats
 * each recommendation as one "trade" — the honest "actual user profit % vs
 * buy-and-hold baseline" (SPEC §3.1).
 */

import type { MarketSourceAdapter } from "../market/types.js";
import type { BacktestResult } from "../backtest/types.js";
import { DEFAULT_BENCHMARK } from "../backtest/backtester.js";
import { SeriesIndex, maxDrawdownFromValues } from "./prices.js";
import type { TrackRecordStore } from "./store.js";
import {
  ALL_PERIODS,
  type RealizedOutcome,
  type Scorecard,
  type ScorecardEntry,
  type ScorecardMetrics,
  type ScorecardPeriod,
  type TrackRecordEntry,
} from "./types.js";

export interface ScorecardServiceOptions {
  benchmarkSymbol?: string;
  /** History lookback for price recomputation. Default 5. */
  years?: number;
}

/** Inclusive lower-bound entry date for a period, relative to `asOf`. Pure. */
export function periodStart(asOf: string, period: ScorecardPeriod): string {
  if (period === "ALL") return "0000-01-01";
  const d = new Date(`${asOf}T00:00:00Z`);
  if (period === "1W") d.setUTCDate(d.getUTCDate() - 7);
  else if (period === "1M") d.setUTCMonth(d.getUTCMonth() - 1);
  else if (period === "3M") d.setUTCMonth(d.getUTCMonth() - 3);
  // 1Y = 최근 365일 trailing (올해 누적 YTD 가 1/1 에 1일치만 잡히는 문제 회피).
  else if (period === "1Y") d.setUTCDate(d.getUTCDate() - 365);
  return d.toISOString().slice(0, 10);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function avgOrNull(xs: Array<number | null>): number | null {
  const vals = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return vals.length > 0 ? round2(mean(vals)) : null;
}

/** Average the logged 5Y backtest snapshots for a period (undefined if none). */
function aggregateBacktest(snapshots: Array<BacktestResult | undefined>) {
  const bts = snapshots.filter((b): b is BacktestResult => b != null);
  if (bts.length === 0) return undefined;
  return {
    excessReturnPct: round2(mean(bts.map((b) => b.excessReturnPct))),
    winRatePct: avgOrNull(bts.map((b) => b.winRatePct)),
    avgTradeReturnPct: avgOrNull(bts.map((b) => b.avgTradeReturnPct)),
    maxDrawdownPct: round2(mean(bts.map((b) => b.maxDrawdownPct))),
    sampleSize: bts.length,
  };
}

/** An entry paired with its recomputed realized outcome (or null if unpriceable). */
interface EvaluatedEntry {
  entry: TrackRecordEntry;
  outcome: RealizedOutcome | null;
}

export class ScorecardService {
  private readonly store: TrackRecordStore;
  private readonly adapter: MarketSourceAdapter;
  private readonly benchmarkSymbol: string;
  private readonly years: number;

  constructor(store: TrackRecordStore, adapter: MarketSourceAdapter, opts: ScorecardServiceOptions = {}) {
    this.store = store;
    this.adapter = adapter;
    this.benchmarkSymbol = opts.benchmarkSymbol ?? DEFAULT_BENCHMARK;
    this.years = opts.years ?? 5;
  }

  async compute(asOf: string, periods: readonly ScorecardPeriod[] = ALL_PERIODS): Promise<Scorecard> {
    const entries = this.store.readAll();

    // Fetch each unique symbol + benchmark once (cached by the market layer).
    const symbolIndex = new Map<string, SeriesIndex>();
    const symbols = new Set(entries.map((e) => e.symbol));
    const benchmarks = new Set(entries.map((e) => e.benchmarkSymbol));
    benchmarks.add(this.benchmarkSymbol);

    await Promise.all(
      [...symbols, ...benchmarks].map(async (sym) => {
        try {
          const series = await this.adapter.getHistory(sym, { years: this.years });
          symbolIndex.set(sym, new SeriesIndex(series.candles));
        } catch {
          // symbol uncomputable; its entries become un-evaluated (honest gap)
        }
      }),
    );

    // Recompute each entry's realized outcome against its frozen entry price.
    const evaluated: EvaluatedEntry[] = entries.map((entry) => {
      const assetIdx = symbolIndex.get(entry.symbol);
      const benchIdx = symbolIndex.get(entry.benchmarkSymbol);
      const assetNow = assetIdx?.priceOnOrBefore(asOf) ?? null;
      const benchNow = benchIdx?.priceOnOrBefore(asOf) ?? null;
      if (!assetNow || !benchNow || entry.entryPrice <= 0 || entry.benchmarkEntryPrice <= 0) {
        return { entry, outcome: null };
      }
      const returnPct = (assetNow.price / entry.entryPrice - 1) * 100;
      const benchmarkReturnPct = (benchNow.price / entry.benchmarkEntryPrice - 1) * 100;
      return {
        entry,
        outcome: {
          symbol: entry.symbol,
          date: entry.date,
          entryPrice: entry.entryPrice,
          lastPrice: assetNow.price,
          returnPct,
          benchmarkReturnPct,
          excessReturnPct: returnPct - benchmarkReturnPct,
        },
      };
    });

    // Calendar for the basket equity curve (benchmark trading days).
    const calendar = symbolIndex.get(this.benchmarkSymbol);

    const periodMetrics = periods.map((period) =>
      this.metricsForPeriod(period, asOf, evaluated, symbolIndex, calendar),
    );

    return {
      asOf,
      benchmarkSymbol: this.benchmarkSymbol,
      totalRecommendations: entries.length,
      periods: periodMetrics,
    };
  }

  private metricsForPeriod(
    period: ScorecardPeriod,
    asOf: string,
    evaluated: EvaluatedEntry[],
    symbolIndex: Map<string, SeriesIndex>,
    calendar: SeriesIndex | undefined,
  ): ScorecardMetrics {
    const start = periodStart(asOf, period);
    const inPeriod = evaluated.filter((e) => e.entry.date >= start && e.entry.date <= asOf);
    const withOutcome = inPeriod.filter((e): e is EvaluatedEntry & { outcome: RealizedOutcome } => e.outcome != null);

    // 5Y backtest aggregate over the period's logged snapshots (realized 옆 비교용).
    const backtest = aggregateBacktest(inPeriod.map((e) => e.entry.backtest));

    // 전체 추천 목록: 평가분은 수익률 포함, 미평가분은 null. 수익률 desc(미평가는 뒤).
    const entries: ScorecardEntry[] = inPeriod
      .map((e) =>
        e.outcome
          ? {
              symbol: e.outcome.symbol,
              date: e.outcome.date,
              returnPct: round2(e.outcome.returnPct),
              benchmarkReturnPct: round2(e.outcome.benchmarkReturnPct),
              excessReturnPct: round2(e.outcome.excessReturnPct),
            }
          : { symbol: e.entry.symbol, date: e.entry.date, returnPct: null, benchmarkReturnPct: null, excessReturnPct: null },
      )
      .sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity));

    const base: ScorecardMetrics = {
      period,
      periodStart: start,
      asOf,
      recommendations: inPeriod.length,
      evaluated: withOutcome.length,
      winRatePct: null,
      avgTradeReturnPct: null,
      cumulativeReturnPct: null,
      benchmarkSymbol: this.benchmarkSymbol,
      benchmarkReturnPct: null,
      excessReturnPct: null,
      maxDrawdownPct: null,
      backtest,
      entries,
    };
    if (withOutcome.length === 0) return base;

    const returns = withOutcome.map((e) => e.outcome.returnPct);
    const benchReturns = withOutcome.map((e) => e.outcome.benchmarkReturnPct);
    const wins = returns.filter((r) => r > 0).length;
    const portfolioReturn = mean(returns);
    const benchmarkReturn = mean(benchReturns);

    let best = withOutcome[0]!.outcome;
    let worst = withOutcome[0]!.outcome;
    for (const e of withOutcome) {
      if (e.outcome.returnPct > best.returnPct) best = e.outcome;
      if (e.outcome.returnPct < worst.returnPct) worst = e.outcome;
    }

    return {
      ...base,
      winRatePct: round2((wins / withOutcome.length) * 100),
      avgTradeReturnPct: round2(portfolioReturn),
      cumulativeReturnPct: round2(portfolioReturn),
      benchmarkReturnPct: round2(benchmarkReturn),
      excessReturnPct: round2(portfolioReturn - benchmarkReturn),
      maxDrawdownPct: this.basketMaxDrawdown(withOutcome, asOf, symbolIndex, calendar),
      best: { symbol: best.symbol, date: best.date, returnPct: round2(best.returnPct) },
      worst: { symbol: worst.symbol, date: worst.date, returnPct: round2(worst.returnPct) },
    };
  }

  /**
   * MDD of the equal-weight basket equity curve over the period: each day's value
   * is the average growth (price/entryPrice) across recommendations active by that
   * day. Uses the benchmark calendar; carries each symbol's last known price.
   */
  private basketMaxDrawdown(
    withOutcome: Array<EvaluatedEntry & { outcome: RealizedOutcome }>,
    asOf: string,
    symbolIndex: Map<string, SeriesIndex>,
    calendar: SeriesIndex | undefined,
  ): number | null {
    if (!calendar) return null;
    const minEntryDate = withOutcome.reduce(
      (m, e) => (e.entry.entryPriceDate < m ? e.entry.entryPriceDate : m),
      withOutcome[0]!.entry.entryPriceDate,
    );
    const dates = calendar.datesBetween(minEntryDate, asOf);
    if (dates.length < 2) return null;

    const equity: number[] = [];
    for (const d of dates) {
      const growths: number[] = [];
      for (const e of withOutcome) {
        if (e.entry.entryPriceDate > d) continue; // not yet entered
        const idx = symbolIndex.get(e.entry.symbol);
        const p = idx?.priceOnOrBefore(d);
        if (p) growths.push(p.price / e.entry.entryPrice);
      }
      if (growths.length > 0) equity.push(mean(growths));
    }
    if (equity.length < 2) return null;
    return round2(maxDrawdownFromValues(equity));
  }
}
