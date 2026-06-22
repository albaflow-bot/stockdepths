/**
 * Daily recommendation batch — the single oneshot pipeline (SPEC Task 2).
 *
 * Once per day: gather each candidate's 5Y history + recent verified news from
 * the cached market layer (Task 1), reduce them to compact deterministic features
 * (no per-stock LLM), then run ONE Claude Sonnet 4.6 oneshot (Gemini fallback on
 * load) to select 3–5 picks with one-line rationale + confidence/risk badges. The
 * result is persisted as the shared public artifact and is idempotent per day.
 *
 * Backtesting (Task 3) and the append-only track record (Task 4) consume this
 * artifact downstream; this module produces it.
 */

import { buildTickerFeatures, type TickerFeatures } from "../features/indicators.js";
import type { MarketSourceAdapter, Market } from "../market/types.js";
import { getMarketRegistry } from "../market/index.js";
import { ADVICE_DISCLAIMER } from "../llm/prompt.js";
import { LlmError, type Pick, type PersonaContext } from "../llm/types.js";
import { makePicksGenerator, type PicksGenerator } from "../llm/generator.js";
import { US_UNIVERSE_NAMES } from "../config/universe.js";
import { makeSymbolBacktester, type SymbolBacktester } from "../backtest/backtester.js";
import { ArtifactStore, type DailyPicksArtifact } from "./artifactStore.js";

export interface RunDailyBatchOptions {
  market?: Market;
  /** YYYY-MM-DD this run is for. Required (no Date.now in library code). */
  date: string;
  /** Candidate tickers. */
  universe: string[];
  /** Persona context for matching (optional; artifact stays shared/public). */
  persona?: PersonaContext;
  /** Source adapter; defaults to the registry's cached US adapter. */
  adapter?: MarketSourceAdapter;
  /** Picks generator; defaults to the env-configured provider chain. */
  generator?: PicksGenerator;
  /**
   * Per-symbol backtester run on each pick before delivery (Task 3). Defaults to
   * a {@link makeSymbolBacktester} bound to the adapter + S&P500 (SPY) benchmark.
   * Pass `null` to skip backtesting entirely.
   */
  backtester?: SymbolBacktester | null;
  /** S&P500 proxy ticker for the backtest benchmark. Default SPY. */
  benchmarkSymbol?: string;
  store?: ArtifactStore;
  /**
   * Optional hook to immutably log the delivered artifact into the append-only
   * track record (Task 4). Runs only on fresh generation, after the artifact is
   * stored; recording failures never block delivery. See {@link makeArtifactRecorder}.
   */
  recorder?: (artifact: DailyPicksArtifact) => Promise<void>;
  /** Re-run even if today's artifact already exists. Default false. */
  force?: boolean;
  /** ISO timestamp to stamp the artifact with (no clock in library code). */
  generatedAt: string;
  /** Lookback years for the long-term axis. Default 5. */
  years?: number;
}

/** One ticker's gathered features, or the reason it was skipped. */
interface GatherOutcome {
  symbol: string;
  features?: TickerFeatures;
  error?: unknown;
}

async function gatherOne(
  adapter: MarketSourceAdapter,
  symbol: string,
  years: number,
): Promise<GatherOutcome> {
  try {
    const series = await adapter.getHistory(symbol, { years });
    if (series.candles.length === 0) {
      return { symbol, error: new Error("no candles") };
    }
    let headlines: string[] | undefined;
    try {
      const news = await adapter.getNews(symbol, { limit: 3 });
      headlines = news.map((n) => n.title);
    } catch {
      // News is best-effort enrichment; never block a pick on a feed outage.
    }
    return { symbol, features: buildTickerFeatures(series, headlines) };
  } catch (error) {
    return { symbol, error };
  }
}

/**
 * Backtest each pick over the prior 5 years and attach the result. Runs
 * concurrently; an individual failure leaves that pick's `backtest` undefined.
 */
async function attachBacktests(
  picks: Pick[],
  opts: RunDailyBatchOptions,
  adapter: MarketSourceAdapter,
): Promise<Pick[]> {
  if (opts.backtester === null) return picks;
  const backtester: SymbolBacktester =
    opts.backtester ??
    makeSymbolBacktester(adapter, {
      benchmarkSymbol: opts.benchmarkSymbol,
      years: opts.years ?? 5,
    });

  return Promise.all(
    picks.map(async (pick) => {
      try {
        return { ...pick, backtest: await backtester(pick.symbol) };
      } catch {
        // Insufficient data or transient fetch error — deliver the pick without
        // the backtest panel rather than failing the whole batch.
        return pick;
      }
    }),
  );
}

/**
 * Run (or return the cached) daily batch for a market+date. The LLM is called at
 * most once per (market, date) unless `force` is set.
 */
export async function runDailyBatch(
  opts: RunDailyBatchOptions,
): Promise<DailyPicksArtifact> {
  const market: Market = opts.market ?? "US";
  const store = opts.store ?? new ArtifactStore();
  const years = opts.years ?? 5;

  // Amortize: one shared artifact per day.
  if (!opts.force) {
    const existing = store.get(market, opts.date);
    if (existing) return existing;
  }

  const adapter = opts.adapter ?? getMarketRegistry().require(market);

  // Gather features concurrently; tolerate individual-symbol failures.
  const outcomes = await Promise.all(
    opts.universe.map((sym) => gatherOne(adapter, sym, years)),
  );
  const features = outcomes
    .map((o) => o.features)
    .filter((f): f is TickerFeatures => f != null);

  if (features.length === 0) {
    throw new LlmError(
      `daily batch aborted: no market data available for any of ${opts.universe.length} candidates`,
      outcomes.map((o) => o.error).filter(Boolean),
    );
  }

  // Ground the prompt with canonical company names (US) so the model is less
  // likely to glitch a symbol, and so the symbol guard can recover one by name.
  const enriched: TickerFeatures[] =
    market === "US"
      ? features.map((f) => ({
          ...f,
          companyName: f.companyName ?? US_UNIVERSE_NAMES[f.symbol.toUpperCase()],
        }))
      : features;

  const generator = opts.generator ?? makePicksGenerator();
  const generated = await generator({
    features: enriched,
    asOfDate: opts.date,
    marketLabel: market === "US" ? "미국(나스닥/S&P)" : market,
    persona: opts.persona,
  });

  // Automatic backtest before delivery (Task 3): attach a 5Y backtest to each
  // pick. Resilient — a single backtest failure omits that panel but never blocks
  // delivery of the pick.
  const picks = await attachBacktests(generated.picks, opts, adapter);

  const artifact: DailyPicksArtifact = {
    market,
    date: opts.date,
    generatedAt: opts.generatedAt,
    picks,
    marketContext: generated.marketContext,
    provider: generated.provider,
    model: generated.model,
    disclaimer: ADVICE_DISCLAIMER,
    universe: features.map((f) => f.symbol),
  };

  store.put(artifact);

  // Immutably log this recommendation set for the honest scorecard (Task 4).
  if (opts.recorder) {
    try {
      await opts.recorder(artifact);
    } catch {
      // Track-record logging is non-blocking — never fail delivery on a log error.
    }
  }

  return artifact;
}
