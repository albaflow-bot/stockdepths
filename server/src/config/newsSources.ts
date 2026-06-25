/**
 * News/disclosure source WHITELIST (SPEC 피드백 라운드 3 §5.2-4 / §5.3 출처 게이트).
 *
 * The product surfaces timing context ("왜") only from *verified* sources — official
 * disclosures (DART/EDGAR) + a designated press RSS whitelist. 찌라시·미검증 출처는
 * 배제한다. This file is the SINGLE place a source is added: append a `NewsSource`
 * here and the collector (`server/src/news/collector.ts`) picks it up — no other code
 * changes. The gate (`server/src/news/gate.ts`) drops any item whose URL host is not
 * in the union of these sources' `domains`, so even a mis-tagged feed item can't
 * smuggle an untrusted origin into the brief.
 *
 * Honest free-path status (consistent with `server/src/market/FREE_DATA_PATHS.md`):
 *  • SEC EDGAR (US disclosure): free, keyless Atom feed. Active.
 *  • Yahoo Finance headline RSS (US/KR press): free, keyless. Active.
 *  • OpenDART (KR disclosure): requires a free API key (no keyless RSS). Declared +
 *    domain-whitelisted so its URLs are trusted, but `requiresKey: true` means the
 *    collector skips it gracefully until `DART_API_KEY` + a JSON adapter are wired —
 *    we do not fabricate a keyless DART feed.
 */

import type { Market } from "../market/types.js";

export type NewsSourceKind = "news" | "disclosure";

export interface NewsSource {
  /** Stable id, also used as the NewsItem `source` label. */
  id: string;
  label: string;
  /** Market this source serves, or "ALL" for cross-market. */
  market: Market | "ALL";
  kind: NewsSourceKind;
  /** Trusted hostnames (suffix-matched). The gate's allow-list is the union of these. */
  domains: string[];
  /** Per-symbol feed URL builder (omit if the source is market-wide only). */
  symbolFeedUrl?: (symbol: string) => string;
  /** Market-wide feed URL builder (omit if the source is per-symbol only). */
  marketFeedUrl?: () => string;
  /** Extra request headers (e.g. SEC fair-access requires an identifying UA). */
  headers?: Record<string, string>;
  /**
   * True when the source needs an API key we may not have. The collector skips it
   * gracefully when the key is absent (never fabricates the feed).
   */
  requiresKey?: boolean;
}

function enc(symbol: string): string {
  return encodeURIComponent(symbol.trim().toUpperCase());
}

/** KR Yahoo symbols need a board suffix; default bare codes to KOSPI (.KS). */
function krYahooSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  return /\.(KS|KQ)$/i.test(s) ? s : `${s}.KS`;
}

/**
 * The whitelist. To add a verified source, append ONE entry here — nothing else.
 */
export const WHITELISTED_SOURCES: readonly NewsSource[] = [
  // ── US press (verified aggregator headline RSS) ──────────────────────────────
  {
    id: "yahoo-rss-us",
    label: "Yahoo Finance (US)",
    market: "US",
    kind: "news",
    domains: ["finance.yahoo.com", "yahoo.com"],
    symbolFeedUrl: (s) =>
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${enc(s)}&region=US&lang=en-US`,
    marketFeedUrl: () =>
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US",
  },
  // ── US disclosure (verified filings) ─────────────────────────────────────────
  {
    id: "sec-edgar",
    label: "SEC EDGAR 8-K",
    market: "US",
    kind: "disclosure",
    domains: ["sec.gov"],
    symbolFeedUrl: (s) =>
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${enc(s)}&type=8-K&dateb=&owner=include&count=20&output=atom`,
    // SEC fair-access policy requires an identifying UA.
    headers: { "User-Agent": "StockTimingBot/0.1 contact@example.invalid" },
  },
  // ── KR press (verified aggregator headline RSS) ──────────────────────────────
  {
    id: "yahoo-rss-kr",
    label: "Yahoo Finance (KR)",
    market: "KR",
    kind: "news",
    domains: ["finance.yahoo.com", "yahoo.com"],
    symbolFeedUrl: (s) =>
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${enc(krYahooSymbol(s))}&region=KR&lang=ko-KR`,
    marketFeedUrl: () =>
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EKS11&region=KR&lang=ko-KR",
  },
  // ── KR disclosure (declared + domain-trusted; inactive until a key is wired) ──
  {
    id: "dart",
    label: "DART 전자공시 (OpenDART)",
    market: "KR",
    kind: "disclosure",
    domains: ["dart.fss.or.kr", "opendart.fss.or.kr"],
    requiresKey: true,
  },
];

/** Union of every whitelisted source's trusted domains — the gate's allow-list. */
export const WHITELISTED_DOMAINS: readonly string[] = [
  ...new Set(WHITELISTED_SOURCES.flatMap((s) => s.domains)),
];

/** Sources serving a given market (its own + "ALL"). */
export function sourcesForMarket(market: Market): NewsSource[] {
  return WHITELISTED_SOURCES.filter((s) => s.market === market || s.market === "ALL");
}
