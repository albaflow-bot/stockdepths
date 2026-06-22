/**
 * Quotes client — fetches current (delayed) prices for the user's watchlist +
 * holdings so P&L can be computed on-device. Reads the API base from env; on no
 * base / network error / non-OK it throws QuotesUnavailableError, and the screen
 * still shows holdings (cost basis) without live P&L (graceful degradation).
 */

import { apiBaseUrl } from "./config";

export interface Quote {
  symbol: string;
  price: number;
  previousClose?: number;
  changePercent?: number;
  asOf?: string;
}

export class QuotesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotesUnavailableError";
  }
}

export type QuotesLoader = (symbols: string[]) => Promise<Record<string, Quote>>;

/** Fetch quotes for a set of symbols, returning a symbol→quote map (uppercased). */
export const fetchQuotes: QuotesLoader = async (symbols) => {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return {};

  const base = apiBaseUrl();
  if (!base) {
    throw new QuotesUnavailableError("시세 서버가 아직 연결되지 않았습니다.");
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/quotes?symbols=${encodeURIComponent(unique.join(","))}`);
  } catch {
    throw new QuotesUnavailableError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (!res.ok) {
    throw new QuotesUnavailableError(`시세를 불러오지 못했습니다 (오류 ${res.status}).`);
  }

  const data = (await res.json()) as Quote[] | { quotes?: Quote[] };
  const list = Array.isArray(data) ? data : (data.quotes ?? []);
  const map: Record<string, Quote> = {};
  for (const q of list) {
    if (q && q.symbol) map[q.symbol.toUpperCase()] = q;
  }
  return map;
};
