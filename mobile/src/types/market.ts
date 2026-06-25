/**
 * Client-side mirror of the server's market-overview index contract (server Task 2,
 * `server/src/market/overview.ts`). Thin local copy so the mobile package stays
 * decoupled from the server build; shapes must match on the wire.
 *
 * Only the index summary is mirrored here — the 관심·보유 탭 / 홈 헤더 시장 요약 바
 * (SPEC §5.2-1) consumes it. Macro indicators (환율·금리·유가 …) are intentionally
 * absent (§5.7 비채택).
 */

/** A market index summary row (지수 요약 바). */
export interface MarketIndex {
  /** Yahoo index symbol, e.g. "^KS11". */
  symbol: string;
  /** Korean display name, e.g. "코스피". */
  name: string;
  /** "US" | "KR". */
  market: string;
  price: number;
  previousClose: number;
  /** Absolute change vs previousClose (전일대비). */
  change: number;
  /** Percent change vs previousClose (등락률). */
  changePercent: number;
  /** Latest trading day this row refers to (YYYY-MM-DD). */
  asOf: string;
  /** Free daily data is delayed — flagged honestly (SPEC §현실적 대안). */
  delayed: boolean;
  source: string;
}
