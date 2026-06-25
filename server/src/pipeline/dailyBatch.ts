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
import type {
  DailyBatchGenerator,
  DailyBatchMarketContext,
  RankedTickerRef,
  BriefNewsRef,
} from "../llm/dailyBatch.js";
import type { TimingSignal, DailyMarketBrief } from "../timing/types.js";
import type { MarketOverview, RankedStock } from "../market/overview.js";
import type { NewsCollectResult } from "../news/collector.js";
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
  /**
   * Human-readable market label for the prompt (e.g. "미국(나스닥/S&P)"). Defaults
   * per market; pass to override for a non-US market.
   */
  marketLabel?: string;
  /**
   * Symbol→company-name map used to ground the prompt and let the symbol guard
   * recover a glitched ticker by name. Defaults to the US name map for the US
   * market; pass the KR map (etc.) for other markets.
   */
  companyNames?: Record<string, string>;
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
  /**
   * Extended oneshot generator (SPEC §5.3/§5.4). When BOTH this and
   * {@link marketContext} are supplied, the batch makes ONE LLM call that yields
   * picks + daily_market_brief + DailyBatch timing signals (추가 호출 0 — §5.6).
   * When omitted, the legacy picks-only `generator` path runs (back-compat).
   */
  dailyBatchGenerator?: DailyBatchGenerator;
  /**
   * The day's market context (Task 2 overview + Task 3 gated news), built via
   * {@link buildMarketContext}. Required to take the brief+signals path.
   */
  marketContext?: DailyBatchMarketContext;
  /**
   * Optional hook to immutably log the artifact's brief + signals into the
   * append-only timing stores (same transaction as `recorder`). Non-blocking.
   * See {@link makeTimingRecorder}.
   */
  timingRecorder?: (artifact: DailyPicksArtifact) => Promise<void>;
  /** Re-run even if today's artifact already exists. Default false. */
  force?: boolean;
  /** ISO timestamp to stamp the artifact with (no clock in library code). */
  generatedAt: string;
  /** Lookback years for the long-term axis. Default 5. */
  years?: number;
}

/**
 * Bridge Task 2 (market overview) + Task 3 (gated news) into the extended
 * generator's market context. De-dups ranked tickers across the TOP/popular lists
 * (each gets one DailyBatch signal) and forwards gated news (title + 박제 URL +
 * tags). Pass to {@link RunDailyBatchOptions.marketContext}.
 */
export function buildMarketContext(
  overview?: MarketOverview,
  news?: NewsCollectResult,
  opts: { rankedPerList?: number; newsLimit?: number } = {},
): DailyBatchMarketContext {
  const rankedPerList = opts.rankedPerList ?? 5;
  const newsLimit = opts.newsLimit ?? 15;

  const indices = overview?.indices.map((i) => ({ name: i.name, changePercent: i.changePercent })) ?? [];

  const rankedTickers: RankedTickerRef[] = [];
  const seen = new Set<string>();
  const push = (rows: RankedStock[], category: string): void => {
    for (const r of rows.slice(0, rankedPerList)) {
      const ticker = r.symbol.toUpperCase();
      if (seen.has(ticker)) continue;
      seen.add(ticker);
      rankedTickers.push({ ticker, companyName: r.companyName, category, changePercent: r.changePercent });
    }
  };
  if (overview) {
    push(overview.gainers, "gainers");
    push(overview.losers, "losers");
    push(overview.mostActive, "mostActive");
    push(overview.popular, "popular");
  }

  const newsRefs: BriefNewsRef[] = (news?.items ?? []).slice(0, newsLimit).map((it) => ({
    title: it.title,
    url: it.url,
    tickers: it.tickers,
    kind: it.kind,
  }));

  return { indices, rankedTickers, news: newsRefs };
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

  // Ground the prompt with canonical company names so the model is less likely to
  // glitch a symbol, and so the symbol guard can recover one by name. The map is
  // market-supplied (US defaults to its built-in name map for back-compat).
  const namesMap = opts.companyNames ?? (market === "US" ? US_UNIVERSE_NAMES : undefined);
  const enriched: TickerFeatures[] = namesMap
    ? features.map((f) => ({
        ...f,
        companyName: f.companyName ?? namesMap[f.symbol.toUpperCase()],
      }))
    : features;

  const marketLabel = opts.marketLabel ?? (market === "US" ? "미국(나스닥/S&P)" : market);

  // Generation. The brief+signals path (one extended oneshot) is taken when both a
  // daily-batch generator and market context are supplied (SPEC §5.3/§5.4/§5.6);
  // otherwise the legacy picks-only oneshot runs. Either way: ONE LLM call.
  let rawPicks: Pick[];
  let marketContext: string;
  let provider: string;
  let model: string;
  let brief: DailyMarketBrief | undefined;
  let signals: TimingSignal[] | undefined;

  if (opts.dailyBatchGenerator && opts.marketContext) {
    const gen = await opts.dailyBatchGenerator({
      features: enriched,
      asOfDate: opts.date,
      marketLabel,
      market,
      persona: opts.persona,
      context: opts.marketContext,
      evaluatedAt: opts.generatedAt,
    });
    rawPicks = gen.picks;
    marketContext = gen.marketContext;
    provider = gen.provider;
    model = gen.model;
    brief = gen.brief;
    // Signals for recommendations + TOP/popular tickers, all source=dailyBatch.
    signals = [...gen.pickSignals, ...gen.rankedSignals];
  } else {
    const generator = opts.generator ?? makePicksGenerator();
    const generated = await generator({
      features: enriched,
      asOfDate: opts.date,
      marketLabel,
      persona: opts.persona,
    });
    rawPicks = generated.picks;
    marketContext = generated.marketContext;
    provider = generated.provider;
    model = generated.model;
  }

  // Automatic backtest before delivery (Task 3): attach a 5Y backtest to each
  // pick. Resilient — a single backtest failure omits that panel but never blocks
  // delivery of the pick.
  const picks = await attachBacktests(rawPicks, opts, adapter);

  const artifact: DailyPicksArtifact = {
    market,
    date: opts.date,
    generatedAt: opts.generatedAt,
    picks,
    marketContext,
    provider,
    model,
    disclaimer: ADVICE_DISCLAIMER,
    universe: features.map((f) => f.symbol),
    ...(brief ? { brief } : {}),
    ...(signals ? { signals } : {}),
  };

  store.put(artifact);

  // Immutably log this recommendation set for the honest scorecard (Task 4) and the
  // timing signals + brief (Task 4/§5.6) — same post-store recording step (one batch
  // transaction boundary). Both are non-blocking: a log error never fails delivery.
  if (opts.recorder) {
    try {
      await opts.recorder(artifact);
    } catch {
      // Track-record logging is non-blocking — never fail delivery on a log error.
    }
  }
  if (opts.timingRecorder) {
    try {
      await opts.timingRecorder(artifact);
    } catch {
      // Timing logging is non-blocking too.
    }
  }

  return artifact;
}
