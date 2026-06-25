/**
 * Ticker tagging (input to SPEC §5.3 linked_tickers). Best-effort: scans an item's
 * title + summary for any universe symbol or its company name. The brief task then
 * intersects these tags with the user's 보유/관심 목록 to decide the 뉴스 배지.
 *
 * Matching is conservative to avoid false positives that would mis-link news:
 *  • Company name — case-insensitive substring (essential for KR, where the headline
 *    carries "삼성전자", never the 6-digit code "005930").
 *  • Symbol — word-boundary, case-SENSITIVE uppercase (headlines cite tickers in
 *    caps; this stops "V" or "META" matching ordinary lowercase words).
 * A symbol from a per-symbol feed is always included regardless of text match.
 */

export interface TickerTagger {
  /** Detect every universe ticker mentioned in the given text. */
  detect(text: string): string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a tagger from the tracked universe + optional company-name map. Symbols are
 * uppercased; names are matched case-insensitively.
 */
export function makeTickerTagger(
  universe: string[],
  names: Record<string, string> = {},
): TickerTagger {
  // Precompile one matcher per symbol: a case-sensitive \b SYMBOL \b regex, plus a
  // lowercased company name for substring search.
  const matchers = universe.map((raw) => {
    const symbol = raw.trim().toUpperCase();
    const name = (names[raw] ?? names[symbol] ?? "").trim().toLowerCase();
    return {
      symbol,
      symbolRe: new RegExp(`\\b${escapeRegExp(symbol)}\\b`),
      name: name || undefined,
    };
  });

  return {
    detect(text: string): string[] {
      if (!text) return [];
      const lower = text.toLowerCase();
      const hits = new Set<string>();
      for (const m of matchers) {
        if (m.symbolRe.test(text)) {
          hits.add(m.symbol);
          continue;
        }
        if (m.name && lower.includes(m.name)) hits.add(m.symbol);
      }
      return [...hits];
    },
  };
}
