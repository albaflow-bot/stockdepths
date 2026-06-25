/**
 * Verified news/disclosure collector (SPEC §5.2-4 / §5.3 출처 게이트).
 *
 * Pulls raw items from the whitelisted sources ONLY (`config/newsSources.ts`),
 * passes every item through the domain gate (`gate.ts`), tags tickers (`tag.ts`),
 * and returns de-duped raw text + original URLs. This is the SOURCE the §5.3 LLM
 * summary (next task) reads — it makes NO LLM call itself; it only gathers text.
 *
 * Resilience (SPEC §5.3 / RESILIENCE CONTRACT): a source that is empty, errors, or
 * needs an absent API key is skipped gracefully and noted — a single feed outage
 * never fails the collection (let alone the app). Daily-cacheable via TtlCache.
 */

import { fetchText, type Fetcher, type HttpOptions } from "../market/http.js";
import { parseFeed } from "../market/parse.js";
import { TtlCache } from "../market/cache.js";
import type { Market, NewsItem } from "../market/types.js";
import {
  sourcesForMarket,
  type NewsSource,
} from "../config/newsSources.js";
import { isWhitelistedUrl } from "./gate.js";
import { makeTickerTagger } from "./tag.js";

/** A gated, ticker-tagged news/disclosure item. `url` is the original (brief 박제용). */
export interface CollectedNewsItem extends NewsItem {
  /** Every universe ticker detected in this item (input to §5.3 linked_tickers). */
  tickers: string[];
}

export interface NewsCollectorDeps {
  fetcher?: Fetcher;
  http?: HttpOptions;
  /** Optional shared cache; when present the result is memoized daily per market. */
  cache?: TtlCache;
  /** Cache TTL (ms). Default 30 min (news refreshes faster than the daily close). */
  ttlMs?: number;
  /** True when a DART (or other key-gated) source's key is available. Default false. */
  hasDartKey?: boolean;
}

export interface NewsCollectInput {
  market: Market;
  /** Tracked universe — drives per-symbol feeds + ticker tagging. */
  universe: string[];
  /** Symbol→display-name map (e.g. KR_UNIVERSE_NAMES) for name-based tagging. */
  names?: Record<string, string>;
  /** Overall cap on returned items after de-dup. Default 40. */
  limit?: number;
  /** Skip per-symbol feeds (market-wide only) to bound request count. Default false. */
  marketWideOnly?: boolean;
}

export interface NewsCollectResult {
  market: Market;
  items: CollectedNewsItem[];
  /** Source ids that actually contributed at least one gated item. */
  usedSources: string[];
  /** Honest provenance: skips, key-gated sources, gate drops. */
  notes: string[];
}

const DEFAULT_LIMIT = 40;
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export class NewsCollector {
  private readonly http: HttpOptions;
  private readonly cache?: TtlCache;
  private readonly ttlMs: number;
  private readonly hasDartKey: boolean;

  constructor(deps: NewsCollectorDeps = {}) {
    this.http = { fetcher: deps.fetcher, ...deps.http };
    this.cache = deps.cache;
    this.ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
    this.hasDartKey = deps.hasDartKey ?? false;
  }

  /** Fetch + parse + gate one feed URL into NewsItems; never throws (skip on error). */
  private async fetchFeed(
    url: string,
    source: NewsSource,
    symbol: string | undefined,
    notes: string[],
  ): Promise<NewsItem[]> {
    try {
      const text = await fetchText(url, { ...this.http, headers: { ...this.http.headers, ...source.headers } });
      const parsed = parseFeed(text, {
        market: source.market === "ALL" ? "US" : source.market,
        symbol,
        source: source.id,
        kind: source.kind,
      });
      // Gate every parsed item against this source's trusted domains.
      const gated = parsed.filter((it) => isWhitelistedUrl(it.url, source.domains));
      if (gated.length < parsed.length) {
        notes.push(`${source.id}: ${parsed.length - gated.length}건이 출처 게이트에서 제외됨`);
      }
      return gated;
    } catch {
      notes.push(`${source.id}${symbol ? `:${symbol}` : ""} 수집 실패 — 건너뜀`);
      return [];
    }
  }

  /**
   * Collect verified news/disclosures for a market. Returns gated, tagged, de-duped
   * raw items (newest-first), the contributing sources, and honest notes.
   */
  async collect(input: NewsCollectInput): Promise<NewsCollectResult> {
    const cacheKey = `news:${input.market}`.toLowerCase();
    if (this.cache) {
      const hit = this.cache.get<NewsCollectResult>(cacheKey);
      if (hit) return hit;
    }

    const notes: string[] = [];
    const limit = input.limit ?? DEFAULT_LIMIT;
    const tagger = makeTickerTagger(input.universe, input.names);
    const sources = sourcesForMarket(input.market);
    const collected: NewsItem[] = [];

    for (const source of sources) {
      if (source.requiresKey && !(source.id === "dart" && this.hasDartKey)) {
        notes.push(`${source.id}: API 키 없음 — 비활성(출처는 화이트리스트에 등록됨)`);
        continue;
      }
      // Market-wide feed (one request).
      if (source.marketFeedUrl) {
        collected.push(...(await this.fetchFeed(source.marketFeedUrl(), source, undefined, notes)));
      }
      // Per-symbol feeds (bounded by universe size).
      if (source.symbolFeedUrl && !input.marketWideOnly) {
        for (const symbol of input.universe) {
          collected.push(
            ...(await this.fetchFeed(source.symbolFeedUrl(symbol), source, symbol, notes)),
          );
        }
      }
    }

    // De-dup by id, tag tickers, sort newest-first, cap.
    const byId = new Map<string, NewsItem>();
    for (const it of collected) if (!byId.has(it.id)) byId.set(it.id, it);

    const items: CollectedNewsItem[] = [...byId.values()]
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0))
      .slice(0, limit)
      .map((it) => {
        const detected = tagger.detect(`${it.title} ${it.summary ?? ""}`);
        // A per-symbol feed item is about its symbol even if the text didn't name it.
        const tickers = it.symbol && !detected.includes(it.symbol) ? [it.symbol, ...detected] : detected;
        return { ...it, tickers };
      });

    const usedSources = [...new Set(items.map((it) => it.source))];
    if (items.length === 0) {
      notes.push("검증 출처에서 수집된 항목이 없습니다 — brief는 시세 컨텍스트만으로 진행됩니다.");
    }

    const result: NewsCollectResult = { market: input.market, items, usedSources, notes };
    if (this.cache) this.cache.set(cacheKey, result, this.ttlMs);
    return result;
  }
}

/**
 * All distinct tickers tagged across a collection — the candidate set the §5.3
 * brief intersects with the user's 보유/관심 목록 for linked_tickers.
 */
export function taggedTickers(result: NewsCollectResult): string[] {
  const seen = new Set<string>();
  for (const it of result.items) for (const t of it.tickers) seen.add(t.toUpperCase());
  return [...seen];
}
