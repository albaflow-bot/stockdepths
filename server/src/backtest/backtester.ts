/**
 * Adapter-backed backtester — pulls a symbol's 5Y history and the S&P 500 proxy
 * from the cached market layer (Task 1) and runs the pure engine.
 *
 * S&P 500 benchmark = SPY (a real, free, keyless ticker the existing US adapter
 * fetches directly — indices like ^GSPC need special symbol handling, the ETF
 * does not). The benchmark series is fetched once and reused across all picks in
 * a batch (the adapter also caches it, so even repeats are cache hits).
 */

import type { HistoricalSeries, MarketSourceAdapter } from "../market/types.js";
import { runBacktest } from "./engine.js";
import type { BacktestResult, Strategy } from "./types.js";

/** S&P 500 proxy. SPY is a free, keyless ticker the US adapter fetches directly. */
export const DEFAULT_BENCHMARK = "SPY";

export interface BacktesterOptions {
  benchmarkSymbol?: string;
  strategy?: Strategy;
  /** Lookback years (default 5, per SPEC). */
  years?: number;
}

/** A function that backtests one symbol; throws on insufficient data / fetch error. */
export type SymbolBacktester = (symbol: string) => Promise<BacktestResult>;

export class Backtester {
  private readonly adapter: MarketSourceAdapter;
  private readonly benchmarkSymbol: string;
  private readonly strategy?: Strategy;
  private readonly years: number;
  private benchmark?: Promise<HistoricalSeries>;

  constructor(adapter: MarketSourceAdapter, opts: BacktesterOptions = {}) {
    this.adapter = adapter;
    this.benchmarkSymbol = opts.benchmarkSymbol ?? DEFAULT_BENCHMARK;
    this.strategy = opts.strategy;
    this.years = opts.years ?? 5;
  }

  /** Fetch (and memoize) the benchmark series for this backtester instance. */
  private benchmarkSeries(): Promise<HistoricalSeries> {
    if (!this.benchmark) {
      this.benchmark = this.adapter.getHistory(this.benchmarkSymbol, { years: this.years });
    }
    return this.benchmark;
  }

  async backtestSymbol(symbol: string): Promise<BacktestResult> {
    const [asset, benchmark] = await Promise.all([
      this.adapter.getHistory(symbol, { years: this.years }),
      this.benchmarkSeries(),
    ]);
    return runBacktest(asset.candles, benchmark.candles, {
      symbol,
      benchmarkSymbol: this.benchmarkSymbol,
      strategy: this.strategy,
    });
  }
}

/** Build a per-symbol backtester bound to one adapter + benchmark. */
export function makeSymbolBacktester(
  adapter: MarketSourceAdapter,
  opts: BacktesterOptions = {},
): SymbolBacktester {
  const bt = new Backtester(adapter, opts);
  return (symbol) => bt.backtestSymbol(symbol);
}
