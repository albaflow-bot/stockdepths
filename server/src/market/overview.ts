/**
 * Market overview collection — indices + TOP movers + popular stocks (SPEC 피드백
 * 라운드 3 §5.2-1/2/3). This is the "빈 보유 상태에서도 화면이 살아있게 하는 1차
 * 데이터 소스" (SPEC §5.5-1): the 관심·보유 탭 / 홈 헤더 render it before the user
 * has added any stock.
 *
 * ── Free-data path verification (SPEC §5.6 open question — 단정 ✗) ─────────────
 * The SPEC requires that KR free/legal paths be *empirically verified* before use,
 * and forbids fabricating data or asserting absence without checking. Findings (see
 * also `FREE_DATA_PATHS.md`):
 *  • Indices (코스피 ^KS11 / 코스닥 ^KQ11 / 나스닥 ^IXIC / S&P ^GSPC): VERIFIED free —
 *    Yahoo v8 chart JSON, keyless, daily. Same free path already used + tested by the
 *    US/KR quote adapters; index symbols resolve identically.
 *  • TOP movers (상승/하락/거래상위): there is NO reliable keyless free *exchange-wide*
 *    ranking API (KRX endpoints gate behind forms/keys; portal scraping is ToS-risky).
 *    So rankings are computed deterministically from the app's *tracked universe*
 *    daily candles (free, already-collected data) and honestly labeled scope:
 *    "universe" — NOT presented as an exchange-wide ranking.
 *  • 시가총액 TOP: requires shares-outstanding, absent from free daily candles → omitted
 *    honestly (not faked) until a verified free source exists.
 *  • 인기 검색 종목: no free keyless search-popularity feed → proxied by intraday
 *    attention (|등락률| within the universe), flagged as a proxy. Feeds the pick
 *    candidate pool (§5.2-3) regardless of how it is sourced.
 *  • 업종·테마 상위: kept as an INTERNAL pick-engine input only — never surfaced in the
 *    public overview (§5.2 비채택 / §5.6). No free sector map is bundled yet, so the
 *    internal slot is present but empty pending a verified mapping.
 *  • 환율·금리·유가·원자재 등 거시 패널: intentionally NOT collected (§5.7 비채택).
 *
 * Granularity is the cacheable daily candle — no realtime tick (§5.7). Wrap with the
 * TtlCache (daily TTL) so the once-a-day overview is not re-crawled per request.
 */

import { fetchText, type Fetcher, type HttpOptions } from "./http.js";
import { parseYahooChart } from "./parse.js";
import { yahooRange } from "./adapters/us.js";
import { TtlCache } from "./cache.js";
import type { Candle, Market, MarketSourceAdapter } from "./types.js";

/** A market index summary row (지수 요약 바 — SPEC §5.2-1). */
export interface MarketIndex {
  /** Yahoo index symbol, e.g. "^KS11". */
  symbol: string;
  /** Korean display name, e.g. "코스피". */
  name: string;
  market: Market;
  price: number;
  previousClose: number;
  /** Absolute change vs previousClose (전일대비). */
  change: number;
  /** Percent change vs previousClose (등락률). */
  changePercent: number;
  /** Latest trading day this row refers to (YYYY-MM-DD). */
  asOf: string;
  /** Free daily data is end-of-day / delayed — flagged honestly (SPEC §현실적 대안). */
  delayed: boolean;
  source: string;
}

/** Which list a ranked stock belongs to. */
export type RankCategory = "gainers" | "losers" | "mostActive" | "popular";

/**
 * A ranked stock row for a TOP list. `scope: "universe"` is an honesty flag: these
 * are the top movers *within the app's tracked universe*, not an exchange-wide rank.
 */
export interface RankedStock {
  symbol: string;
  companyName?: string;
  market: Market;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  asOf: string;
  scope: "universe";
}

/**
 * Internal-only sector/theme leaders. NEVER serialized into the public overview —
 * §5.2 비채택 keeps these as a pick-engine input, off the UI. Empty until a verified
 * free sector map is wired (no fabricated sectors).
 */
export interface SectorThemeLeader {
  sector: string;
  symbols: string[];
}

/** The public market overview (UI-facing). */
export interface MarketOverview {
  market: Market;
  /** Freshest trading day across the collected data (YYYY-MM-DD). */
  date: string;
  indices: MarketIndex[];
  gainers: RankedStock[];
  losers: RankedStock[];
  mostActive: RankedStock[];
  /** 인기 종목 (attention proxy) — also merged into the pick candidate pool. */
  popular: RankedStock[];
  /** UTC ISO timestamp the overview was assembled. */
  generatedAt: string;
  /** Honest provenance / which free paths were used or unavailable this run. */
  notes: string[];
}

/** Index definitions per market (SPEC §5.2-1: KR 코스피/코스닥 + US 나스닥/S&P). */
export const INDEX_DEFS: Record<Market, ReadonlyArray<{ symbol: string; name: string }>> = {
  US: [
    { symbol: "^GSPC", name: "S&P 500" },
    { symbol: "^IXIC", name: "나스닥" },
  ],
  KR: [
    { symbol: "^KS11", name: "코스피" },
    { symbol: "^KQ11", name: "코스닥" },
  ],
};

const DEFAULT_TOP_N = 5;
/** Daily overview TTL — the data only changes once per session close. */
const DEFAULT_OVERVIEW_TTL_MS = 6 * 60 * 60 * 1000;
/** ~30 calendar days guarantees ≥2 sessions through weekends/holidays. */
const SHORT_WINDOW_YEARS = 30 / 365;

export interface OverviewDeps {
  fetcher?: Fetcher;
  http?: HttpOptions;
  /** Injectable clock for deterministic index-range URLs in tests. */
  now?: () => Date;
  /** Optional shared cache; when present the assembled overview is memoized daily. */
  cache?: TtlCache;
  /** Overview cache TTL (ms). Default 6h. */
  ttlMs?: number;
}

export interface CollectInput {
  market: Market;
  /** Cached per-market adapter (from the registry) — source-agnostic per §3.3. */
  adapter: MarketSourceAdapter;
  /** Symbols to rank (the tracked universe). */
  universe: string[];
  /** Optional symbol→display-name map (e.g. KR_UNIVERSE_NAMES). */
  names?: Record<string, string>;
  /** Rows per TOP list. Default 5. */
  topN?: number;
}

/** Derive a delayed quote (price/prev/change/asOf) from a candle series' last two. */
export function quoteFromCandles(candles: Candle[]):
  | { price: number; previousClose: number; change: number; changePercent: number; volume: number; asOf: string }
  | undefined {
  if (candles.length === 0) return undefined;
  const last = candles[candles.length - 1]!;
  const prev = candles.length >= 2 ? candles[candles.length - 2]! : last;
  const change = last.close - prev.close;
  const changePercent = prev.close !== 0 ? (change / prev.close) * 100 : 0;
  return {
    price: last.close,
    previousClose: prev.close,
    change,
    changePercent,
    volume: last.volume,
    asOf: last.date,
  };
}

/**
 * Pure ranking over already-collected rows (no I/O — unit-testable). Produces the
 * four TOP lists, each truncated to `topN`:
 *  • gainers    — highest 등락률 first
 *  • losers     — lowest 등락률 first
 *  • mostActive — highest volume first (거래상위)
 *  • popular    — highest |등락률| first (attention proxy for 인기 검색 종목)
 */
export function rankStocks(
  rows: RankedStock[],
  topN: number = DEFAULT_TOP_N,
): { gainers: RankedStock[]; losers: RankedStock[]; mostActive: RankedStock[]; popular: RankedStock[] } {
  const byChangeDesc = [...rows].sort((a, b) => b.changePercent - a.changePercent);
  const byVolumeDesc = [...rows].sort((a, b) => b.volume - a.volume);
  const byAttentionDesc = [...rows].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent),
  );
  return {
    gainers: byChangeDesc.slice(0, topN),
    losers: [...byChangeDesc].reverse().slice(0, topN),
    mostActive: byVolumeDesc.slice(0, topN),
    popular: byAttentionDesc.slice(0, topN),
  };
}

export class MarketOverviewCollector {
  private readonly http: HttpOptions;
  private readonly now: () => Date;
  private readonly cache?: TtlCache;
  private readonly ttlMs: number;

  constructor(deps: OverviewDeps = {}) {
    this.http = { fetcher: deps.fetcher, ...deps.http };
    this.now = deps.now ?? (() => new Date());
    this.cache = deps.cache;
    this.ttlMs = deps.ttlMs ?? DEFAULT_OVERVIEW_TTL_MS;
  }

  /** Yahoo v8 chart URL for an index/raw symbol over a short daily window. */
  indexChartUrl(symbol: string): string {
    const sym = encodeURIComponent(symbol.trim());
    return `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${yahooRange(SHORT_WINDOW_YEARS)}&interval=1d&events=div%2Csplits`;
  }

  /** Collect index rows for a market (Yahoo chart, verified free path). */
  async collectIndices(market: Market, notes: string[]): Promise<MarketIndex[]> {
    const out: MarketIndex[] = [];
    for (const def of INDEX_DEFS[market]) {
      try {
        const json = await fetchText(this.indexChartUrl(def.symbol), this.http);
        const q = quoteFromCandles(parseYahooChart(json));
        if (!q) {
          notes.push(`지수 ${def.name}(${def.symbol}) 데이터 없음 — 건너뜀`);
          continue;
        }
        out.push({
          symbol: def.symbol,
          name: def.name,
          market,
          price: q.price,
          previousClose: q.previousClose,
          change: q.change,
          changePercent: q.changePercent,
          asOf: q.asOf,
          delayed: true,
          source: "yahoo",
        });
      } catch {
        // Stale-on-error at the cache layer; here we just skip and stay honest.
        notes.push(`지수 ${def.name}(${def.symbol}) 수집 실패 — 건너뜀`);
      }
    }
    return out;
  }

  /** Build ranked rows from the universe's daily candles (universe-scoped). */
  async collectRows(input: CollectInput, notes: string[]): Promise<RankedStock[]> {
    const { market, adapter, universe, names } = input;
    const rows: RankedStock[] = [];
    let failures = 0;
    for (const symbol of universe) {
      try {
        const series = await adapter.getHistory(symbol, { years: SHORT_WINDOW_YEARS });
        const q = quoteFromCandles(series.candles);
        if (!q) {
          failures++;
          continue;
        }
        rows.push({
          symbol: series.symbol,
          companyName: names?.[symbol] ?? names?.[series.symbol],
          market,
          price: q.price,
          previousClose: q.previousClose,
          change: q.change,
          changePercent: q.changePercent,
          volume: q.volume,
          asOf: q.asOf,
          scope: "universe",
        });
      } catch {
        failures++;
      }
    }
    if (failures > 0) {
      notes.push(`종목 시세 ${failures}건 수집 실패 — 가능한 종목만으로 순위 산출`);
    }
    return rows;
  }

  /**
   * Collect the full overview for a market. Daily-cacheable (memoized per market
   * when a cache is supplied). TOP lists are universe-scoped; popular feeds the
   * pick candidate pool via {@link popularSymbols}.
   */
  async collect(input: CollectInput): Promise<MarketOverview> {
    const cacheKey = `overview:${input.market}`.toLowerCase();
    if (this.cache) {
      const hit = this.cache.get<MarketOverview>(cacheKey);
      if (hit) return hit;
    }

    const notes: string[] = [];
    const topN = input.topN ?? DEFAULT_TOP_N;

    const indices = await this.collectIndices(input.market, notes);
    const rows = await this.collectRows(input, notes);
    const ranked = rankStocks(rows, topN);

    notes.push("TOP 순위는 앱 추적 유니버스 기준입니다(거래소 전체 순위 아님).");
    notes.push("인기 종목은 |등락률| 기반 주목도 프록시입니다(무료 검색량 소스 미검증).");
    if (rows.length === 0 && indices.length === 0) {
      notes.push("시장 데이터를 가져오지 못했습니다 — 캐시 또는 다음 배치를 기다립니다.");
    }

    // Freshest trading day across everything collected (honest 'date' label).
    const days = [...indices.map((i) => i.asOf), ...rows.map((r) => r.asOf)].filter(Boolean).sort();
    const date = days.length > 0 ? days[days.length - 1]! : this.now().toISOString().slice(0, 10);

    const overview: MarketOverview = {
      market: input.market,
      date,
      indices,
      gainers: ranked.gainers,
      losers: ranked.losers,
      mostActive: ranked.mostActive,
      popular: ranked.popular,
      generatedAt: this.now().toISOString(),
      notes,
    };

    if (this.cache) this.cache.set(cacheKey, overview, this.ttlMs);
    return overview;
  }
}

/**
 * Symbols from the overview's 인기 종목 list, for merging into the daily pick
 * candidate pool (SPEC §5.2-3: 추천 후보 풀 보강). De-duped, uppercase.
 */
export function popularSymbols(overview: MarketOverview): string[] {
  const seen = new Set<string>();
  for (const r of overview.popular) seen.add(r.symbol.toUpperCase());
  return [...seen];
}
