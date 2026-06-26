/**
 * Timing-signal accuracy — the honesty proof for the product's MAIN feature
 * (SPEC §5.6: 메인 기능의 정직성 증명). Reads the append-only DailyBatch TimingSignal
 * log (Task 4) and, against later real prices, scores:
 *   • Buy  → 적중 when the price ROSE over the horizon (상승 적중),
 *   • Sell → 적중 when the price FELL over the horizon (하락 회피),
 * published per 1W/1M/3M/1Y period.
 *
 * This module is READ-ONLY over the immutable log — it never rewrites a signal, so
 * the past can't be massaged (SPEC §5.6 / append-only contract). The hit criterion
 * is explicit and surfaced (criterion string), and when too few signals are
 * evaluable the period is flagged `lowSample` rather than overstated (과장 ✗).
 */

import type { MarketSourceAdapter } from "../market/types.js";
import { SeriesIndex } from "./prices.js";
import { periodStart } from "./scorecard.js";
import { ALL_PERIODS, type ScorecardPeriod } from "./types.js";
import type { TimingSignalStore } from "../timing/store.js";

/** Hit stats for one signal direction within a period. */
export interface TimingHitStats {
  /** Signals of this kind whose entry date falls in the period. */
  total: number;
  /** Of those, how many had enough forward price data to judge. */
  evaluated: number;
  /** Of the evaluated, how many were correct. */
  hits: number;
  /** hits / evaluated, in % — null when evaluated === 0. */
  hitRatePct: number | null;
}

export interface TimingAccuracyMetrics {
  period: ScorecardPeriod;
  periodStart: string;
  asOf: string;
  /** Forward window (calendar days) the hit is judged over. */
  horizonDays: number;
  buy: TimingHitStats;
  sell: TimingHitStats;
  /** Combined directional accuracy (buy ∪ sell). */
  overall: TimingHitStats;
  /** True when too few signals were evaluable to trust the rate (과장 방지). */
  lowSample: boolean;
}

export interface TimingAccuracy {
  asOf: string;
  horizonDays: number;
  /** Minimum evaluated directional signals before a rate is considered trustworthy. */
  minSample: number;
  /** Human-readable hit criterion (shown in the UI for transparency). */
  criterion: string;
  periods: TimingAccuracyMetrics[];
}

export interface TimingAccuracyOptions {
  /** Forward window in calendar days for the hit test. Default 7 (≈1주). */
  horizonDays?: number;
  /** Below this many evaluated directional signals, a period is flagged low-sample. Default 5. */
  minSample?: number;
  /** Move threshold in % to count a hit (|forward return| must exceed it). Default 0. */
  thresholdPct?: number;
  /** History lookback for price recomputation. Default 5. */
  years?: number;
}

const DEFAULTS = { horizonDays: 7, minSample: 5, thresholdPct: 0, years: 5 };

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "buy"/"sell" classification of a single forward return; null when not directional/evaluable. */
type Direction = "buy" | "sell";

/** Empty stats accumulator. */
function emptyStats(): { total: number; evaluated: number; hits: number } {
  return { total: 0, evaluated: 0, hits: 0 };
}

function finalize(s: { total: number; evaluated: number; hits: number }): TimingHitStats {
  return {
    total: s.total,
    evaluated: s.evaluated,
    hits: s.hits,
    hitRatePct: s.evaluated > 0 ? round2((s.hits / s.evaluated) * 100) : null,
  };
}

/**
 * Computes timing-signal accuracy from the immutable DailyBatch signal log.
 * Pure read: never mutates the store.
 */
export class TimingAccuracyService {
  private readonly store: TimingSignalStore;
  private readonly adapter: MarketSourceAdapter;
  private readonly horizonDays: number;
  private readonly minSample: number;
  private readonly thresholdPct: number;
  private readonly years: number;

  constructor(store: TimingSignalStore, adapter: MarketSourceAdapter, opts: TimingAccuracyOptions = {}) {
    this.store = store;
    this.adapter = adapter;
    this.horizonDays = opts.horizonDays ?? DEFAULTS.horizonDays;
    this.minSample = opts.minSample ?? DEFAULTS.minSample;
    this.thresholdPct = opts.thresholdPct ?? DEFAULTS.thresholdPct;
    this.years = opts.years ?? DEFAULTS.years;
  }

  /** The explicit, surfaced hit criterion. */
  get criterion(): string {
    const t = this.thresholdPct;
    const moveUp = t > 0 ? `+${t}% 초과 상승` : "상승";
    const moveDn = t > 0 ? `-${t}% 초과 하락` : "하락";
    return `신호일 종가 대비 ${this.horizonDays}일 후 종가 기준 — 매수는 ${moveUp}, 매도는 ${moveDn} 시 적중. 표본 ${this.minSample}건 미만은 '표본 부족'으로 표기.`;
  }

  async compute(asOf: string, periods: readonly ScorecardPeriod[] = ALL_PERIODS): Promise<TimingAccuracy> {
    // Only DailyBatch signals are server-persisted/scored (OnDeviceRule는 단말 개인 신호).
    const signals = this.store.readAll().filter((s) => s.source === "dailyBatch");

    // Fetch each unique ticker's series once (cached by the market layer).
    const seriesByTicker = new Map<string, SeriesIndex>();
    await Promise.all(
      [...new Set(signals.map((s) => s.ticker.toUpperCase()))].map(async (ticker) => {
        try {
          const series = await this.adapter.getHistory(ticker, { years: this.years });
          seriesByTicker.set(ticker, new SeriesIndex(series.candles));
        } catch {
          // uncomputable ticker → its signals stay un-evaluated (honest gap)
        }
      }),
    );

    const periodMetrics = periods.map((period) => this.metricsForPeriod(period, asOf, signals, seriesByTicker));
    return {
      asOf,
      horizonDays: this.horizonDays,
      minSample: this.minSample,
      criterion: this.criterion,
      periods: periodMetrics,
    };
  }

  /**
   * Classify one signal's forward outcome: returns whether it was a hit, or null
   * when it isn't directional (hold/watch) or isn't yet evaluable (no forward data).
   */
  private evaluateSignal(
    direction: Direction,
    ticker: string,
    signalDate: string,
    asOf: string,
    seriesByTicker: Map<string, SeriesIndex>,
  ): boolean | null {
    const idx = seriesByTicker.get(ticker.toUpperCase());
    if (!idx) return null;
    const entry = idx.priceOnOrBefore(signalDate);
    if (!entry || entry.price <= 0) return null;

    const forwardTarget = addDays(signalDate, this.horizonDays);
    if (forwardTarget > asOf) return null; // window hasn't elapsed yet → pending, not judged
    const fwd = idx.priceOnOrBefore(forwardTarget);
    if (!fwd || fwd.date <= entry.date) return null; // no new price after entry → not evaluable

    const returnPct = (fwd.price / entry.price - 1) * 100;
    const t = this.thresholdPct;
    return direction === "buy" ? returnPct > t : returnPct < -t;
  }

  private metricsForPeriod(
    period: ScorecardPeriod,
    asOf: string,
    signals: ReturnType<TimingSignalStore["readAll"]>,
    seriesByTicker: Map<string, SeriesIndex>,
  ): TimingAccuracyMetrics {
    const start = periodStart(asOf, period);
    const inPeriod = signals.filter((s) => s.date >= start && s.date <= asOf);

    const buy = emptyStats();
    const sell = emptyStats();
    for (const s of inPeriod) {
      const direction: Direction | null = s.action === "buy" ? "buy" : s.action === "sell" ? "sell" : null;
      if (!direction) continue; // hold/watch are not directional accuracy
      const acc = direction === "buy" ? buy : sell;
      acc.total++;
      const hit = this.evaluateSignal(direction, s.ticker, s.date, asOf, seriesByTicker);
      if (hit == null) continue;
      acc.evaluated++;
      if (hit) acc.hits++;
    }

    const overall = {
      total: buy.total + sell.total,
      evaluated: buy.evaluated + sell.evaluated,
      hits: buy.hits + sell.hits,
    };

    return {
      period,
      periodStart: start,
      asOf,
      horizonDays: this.horizonDays,
      buy: finalize(buy),
      sell: finalize(sell),
      overall: finalize(overall),
      lowSample: overall.evaluated < this.minSample,
    };
  }
}
