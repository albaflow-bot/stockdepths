/**
 * Scout integration for the edge gate (SPEC §5.2 step 1 + §5.3 verification).
 *
 * "Scout 인프라(웹검색 + 24h TTL 캐시)" — domain research over a web-search backend,
 * cached for 24h. We REUSE the existing {@link TtlCache} (no duplicate cache; the
 * SPEC says "중복 신설 금지 — Scout 호출 경유") and an injectable {@link WebSearch}
 * so the gate is testable without a network and so a real search backend can be
 * dropped in later.
 *
 * This project ships no live web-search API, so the default backend is
 * {@link NullWebSearch} (returns nothing). That is the HONEST default: with no
 * evidence, verifiable facts are marked `⚠미검증가설` rather than asserted absent
 * (`feedback_no_unverified_negative_claims`) — they simply can't become the default
 * recommendation. Inject a real WebSearch to actually verify.
 */

import { TtlCache } from "../market/cache.js";
import type { VerificationLevel, VerificationResult } from "./types.js";

/** One web-search hit. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Injectable web-search backend (the only network seam Scout has). */
export interface WebSearch {
  readonly name: string;
  search(query: string): Promise<WebSearchResult[]>;
}

/** Default backend: no live search available → returns nothing (honest default). */
export class NullWebSearch implements WebSearch {
  readonly name = "null";
  async search(): Promise<WebSearchResult[]> {
    return [];
  }
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** Signals that a source is paid/proprietary (→ PaidExclusive / ⚠), in EN + KR. */
const PAID_SIGNALS =
  /\b(paid|premium|enterprise|subscription|proprietary|licensed?|paywall)\b|유료|구독|독점|라이선스|위성|카드\s*결제/i;
/** Signals that a free tier / public access exists (→ verified). */
const FREE_SIGNALS =
  /\b(free|free tier|public|open data|no api key|rss|open-source)\b|무료|공개|오픈\s*데이터|무료\s*티어/i;

export interface ScoutClientOptions {
  /** Web-search backend. Defaults to {@link NullWebSearch}. */
  search?: WebSearch;
  /** Shared TTL cache (reuse, do not create a parallel one). */
  cache?: TtlCache;
  /** Cache TTL for Scout queries. Defaults to 24h (SPEC §5.2). */
  ttlMs?: number;
  /** Injectable clock for deterministic tests (used only for checkedAt). */
  now?: () => string;
}

/**
 * Thin client over the web-search backend + 24h cache. Two jobs:
 *  - {@link research}: gather context for candidate generation.
 *  - {@link verifyDataSource}: turn "does this free/public source exist?" into a
 *    {@link VerificationResult} with a source link + snippet (verifiable fact).
 */
export class ScoutClient {
  private readonly search: WebSearch;
  private readonly cache: TtlCache;
  private readonly ttlMs: number;
  private readonly now: () => string;

  constructor(opts: ScoutClientOptions = {}) {
    this.search = opts.search ?? new NullWebSearch();
    this.cache = opts.cache ?? new TtlCache({ defaultTtlMs: TWENTY_FOUR_HOURS_MS });
    this.ttlMs = opts.ttlMs ?? TWENTY_FOUR_HOURS_MS;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  /** Cached search: identical queries within the TTL never re-hit the backend. */
  private async cachedSearch(query: string): Promise<WebSearchResult[]> {
    const key = `scout:${this.search.name}:${query}`;
    const hit = this.cache.get<WebSearchResult[]>(key);
    if (hit) return hit;
    let results: WebSearchResult[] = [];
    try {
      results = await this.search.search(query);
    } catch {
      // a flaky search must not crash the gate — treat as "no evidence" (graceful)
      results = this.cache.getStale<WebSearchResult[]>(key) ?? [];
    }
    this.cache.set(key, results, this.ttlMs);
    return results;
  }

  /**
   * Domain research (SPEC §5.2 step 1): find public-but-scattered/slow data and
   * workflows in the domain. Returns raw hits to seed candidate generation; an empty
   * array just means the seed context is thin (the LLM still proposes from the idea).
   */
  async research(idea: string, domain: string): Promise<WebSearchResult[]> {
    const query = `${domain} ${idea} 공개 데이터 free public dataset API`.trim();
    return this.cachedSearch(query);
  }

  /**
   * Verify that a candidate's data source exists and is free/accessible (SPEC §5.3,
   * a verifiable fact). Returns a badge + (when found) a source link and snippet:
   *  - free/public evidence found        → `verified` (✓검증됨)
   *  - only paid/proprietary evidence     → `warn` (⚠, PaidExclusive territory)
   *  - no evidence at all                 → `unverified` (⚠미검증가설) — never "absent"
   */
  async verifyDataSource(
    dataSource: string,
    level: VerificationLevel,
  ): Promise<VerificationResult> {
    const results = await this.cachedSearch(`${dataSource} free API 무료 공개 데이터`);
    const checkedAt = this.now();
    if (results.length === 0) {
      return { level, badge: "unverified", verified: false, via: this.search.name, checkedAt };
    }

    const free = results.find((r) => FREE_SIGNALS.test(`${r.title} ${r.snippet}`));
    const paidOnly =
      !free && results.every((r) => PAID_SIGNALS.test(`${r.title} ${r.snippet}`));
    const evidence = free ?? results[0]!;

    if (paidOnly) {
      // Evidence exists but it's paid/proprietary — downgrade, never recommend.
      return {
        level,
        badge: "warn",
        verified: false,
        sourceUrl: evidence.url,
        snippet: evidence.snippet,
        via: this.search.name,
        checkedAt,
      };
    }

    return {
      level,
      badge: free ? "verified" : "warn",
      verified: Boolean(free),
      sourceUrl: evidence.url,
      snippet: evidence.snippet,
      via: this.search.name,
      checkedAt,
    };
  }
}
