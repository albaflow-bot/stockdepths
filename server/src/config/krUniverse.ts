/**
 * Candidate universe for the daily KR oneshot (SPEC §대상 시장: 한국 코스피/코스닥).
 *
 * Mirrors {@link ./universe.ts} (US): a small, liquid large-cap set so the single
 * daily oneshot stays cheap. Symbols are 6-digit KRX codes; all defaults below are
 * KOSPI, so the KR adapter's default ".KS" board suffix is correct. To include a
 * KOSDAQ name, enter it as "CODE.KQ" via the PICKS_UNIVERSE override.
 */

export const DEFAULT_KR_UNIVERSE: string[] = [
  "005930", // Samsung Electronics
  "000660", // SK hynix
  "373220", // LG Energy Solution
  "207940", // Samsung Biologics
  "005380", // Hyundai Motor
  "005490", // POSCO Holdings
  "035420", // NAVER
  "035720", // Kakao
  "051910", // LG Chem
  "006400", // Samsung SDI
  "068270", // Celltrion
  "105560", // KB Financial Group
];

/**
 * Canonical display names for the default KR universe. Same two uses as the US
 * map: ground the prompt with the real company name, and let the symbol guard
 * recover a glitched 6-digit code back to a real ticker by name. Keys must match
 * {@link DEFAULT_KR_UNIVERSE}.
 */
export const KR_UNIVERSE_NAMES: Record<string, string> = {
  "005930": "삼성전자",
  "000660": "SK하이닉스",
  "373220": "LG에너지솔루션",
  "207940": "삼성바이오로직스",
  "005380": "현대차",
  "005490": "POSCO홀딩스",
  "035420": "NAVER",
  "035720": "카카오",
  "051910": "LG화학",
  "006400": "삼성SDI",
  "068270": "셀트리온",
  "105560": "KB금융",
};

/**
 * KOSPI 200 proxy ETF (KODEX 200, KRX code 069500) used as the KR backtest /
 * track-record benchmark — the Korea analogue of SPY for the US set. It is a
 * tradable ticker fetchable by the same KR adapter, so excess-return math has a
 * real benchmark series.
 */
export const KR_BENCHMARK_SYMBOL = "069500";

/** Resolve the universe from env override or fall back to the default KR set. */
export function resolveKrUniverse(): string[] {
  const raw = process.env["PICKS_UNIVERSE"];
  if (!raw) return DEFAULT_KR_UNIVERSE;
  const tickers = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  return tickers.length > 0 ? tickers : DEFAULT_KR_UNIVERSE;
}
