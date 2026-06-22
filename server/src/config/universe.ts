/**
 * Candidate universe for the daily US oneshot.
 *
 * SPEC §우선순위: launch US-first. This is a small, liquid large-cap set
 * (Nasdaq/S&P) so the single daily oneshot stays cheap. Override at runtime with
 * the PICKS_UNIVERSE env var (comma-separated tickers) without touching code.
 */

export const DEFAULT_US_UNIVERSE: string[] = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AVGO",
  "AMD",
  "NFLX",
  "JPM",
  "V",
];

/**
 * Canonical display names for the default universe. Two uses:
 *  - ground the prompt (the model sees the real company name next to each symbol);
 *  - recover a glitched/placeholder symbol back to a real ticker by company name
 *    (the model occasionally emits e.g. "AVAPL_PLACEHOLDER" while still naming
 *    "Apple" — the name disambiguates it). Keys must match {@link DEFAULT_US_UNIVERSE}.
 */
export const US_UNIVERSE_NAMES: Record<string, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  META: "Meta Platforms",
  TSLA: "Tesla",
  AVGO: "Broadcom",
  AMD: "AMD",
  NFLX: "Netflix",
  JPM: "JPMorgan Chase",
  V: "Visa",
};

/** Resolve the universe from env override or fall back to the default set. */
export function resolveUsUniverse(): string[] {
  const raw = process.env["PICKS_UNIVERSE"];
  if (!raw) return DEFAULT_US_UNIVERSE;
  const tickers = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  return tickers.length > 0 ? tickers : DEFAULT_US_UNIVERSE;
}
