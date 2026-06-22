/**
 * Recorder — turns a delivered daily artifact into immutable track-record entries
 * and appends them to the log.
 *
 * The entry context that must be frozen is the ENTRY PRICE: the asset's close on
 * (or just before) the recommendation date, plus the benchmark's close on the
 * same day. We look these up via the cached market layer at record time and store
 * them immutably; the scorecard later recomputes realized returns against them, so
 * the past can never be silently re-priced.
 *
 * Per-symbol failures are skipped (resilience) — a missing price for one ticker
 * never blocks logging the rest of the day's picks.
 */

import type { MarketSourceAdapter } from "../market/types.js";
import type { DailyPicksArtifact } from "../pipeline/artifactStore.js";
import { DEFAULT_BENCHMARK } from "../backtest/backtester.js";
import { SeriesIndex } from "./prices.js";
import { TrackRecordStore } from "./store.js";
import type { TrackRecordEntry } from "./types.js";

export interface RecordOptions {
  adapter: MarketSourceAdapter;
  benchmarkSymbol?: string;
  /** ISO timestamp to stamp entries with (no clock in library code). */
  loggedAt: string;
  /** History lookback for the price lookups. Default 5. */
  years?: number;
}

/**
 * Build immutable entries from `artifact` and append them to `store`. Returns the
 * entries actually appended (idempotent: re-recording the same day is a no-op).
 */
export async function recordArtifact(
  artifact: DailyPicksArtifact,
  store: TrackRecordStore,
  opts: RecordOptions,
): Promise<TrackRecordEntry[]> {
  const benchmarkSymbol = opts.benchmarkSymbol ?? DEFAULT_BENCHMARK;
  const years = opts.years ?? 5;

  // Benchmark entry price (fetched once for the whole artifact).
  let benchPoint: { price: number; date: string } | null = null;
  try {
    const bench = await opts.adapter.getHistory(benchmarkSymbol, { years });
    benchPoint = new SeriesIndex(bench.candles).priceOnOrBefore(artifact.date);
  } catch {
    benchPoint = null;
  }
  if (!benchPoint) {
    // Without a benchmark entry price we can't honestly compute excess later.
    return [];
  }

  const entries: TrackRecordEntry[] = [];
  for (const pick of artifact.picks) {
    try {
      const series = await opts.adapter.getHistory(pick.symbol, { years });
      const entryPoint = new SeriesIndex(series.candles).priceOnOrBefore(artifact.date);
      if (!entryPoint) continue; // no price on/before the rec date → skip this pick
      entries.push({
        id: `${artifact.market}:${artifact.date}:${pick.symbol}`,
        market: artifact.market,
        date: artifact.date,
        symbol: pick.symbol,
        companyName: pick.companyName,
        confidence: pick.confidence,
        risk: pick.risk,
        rationale: pick.rationale,
        entryPrice: entryPoint.price,
        entryPriceDate: entryPoint.date,
        benchmarkSymbol,
        benchmarkEntryPrice: benchPoint.price,
        benchmarkEntryDate: benchPoint.date,
        backtest: pick.backtest,
        loggedAt: opts.loggedAt,
      });
    } catch {
      // skip this pick; logging the rest continues
    }
  }

  return store.append(entries);
}

/**
 * Build a recorder callback for `runDailyBatch({ recorder })` — records each
 * freshly-generated artifact into the track record. `loggedAt` is supplied per
 * call so library code stays clock-free.
 */
export function makeArtifactRecorder(
  store: TrackRecordStore,
  opts: RecordOptions,
): (artifact: DailyPicksArtifact) => Promise<void> {
  return async (artifact) => {
    await recordArtifact(artifact, store, opts);
  };
}
