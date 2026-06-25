/**
 * 관심·보유 대시보드 data client (SPEC §5.5). Pulls the day's market context that
 * makes the tab ACTIVE on entry — the market brief, the TOP/인기 종목 to pick from,
 * and the per-ticker DailyBatch timing signals — from the server (Tasks 2–4 output).
 *
 * NEVER throws: a missing API base / network error / non-OK yields an empty payload
 * so the tab still renders (시장 헤더 + 빈 상태 유도). Graceful degradation, like
 * `quotesClient` / `marketClient` (stale-on-error / Sane default).
 */

import { apiBaseUrl } from "./config";
import type { MarketIndex } from "../types/market";
import type { DailyMarketBrief, TimingSignal } from "../types/timing";

/** A TOP/인기 종목 row offered in '여기서 담기' (SPEC §5.2-2/3). */
export interface RankedStock {
  symbol: string;
  companyName?: string;
  market: string;
  price: number;
  changePercent: number;
  /** Which list it came from (gainers/losers/mostActive/popular) — for context. */
  category?: string;
}

export interface DashboardData {
  indices: MarketIndex[];
  brief?: DailyMarketBrief;
  /** TOP + 인기 종목 merged for the '여기서 담기' picker. */
  top: RankedStock[];
  /** ticker → DailyBatch timing signal (추천·TOP·인기 공용). */
  signals: Record<string, TimingSignal>;
}

export type DashboardLoader = () => Promise<DashboardData>;

export const EMPTY_DASHBOARD: DashboardData = { indices: [], top: [], signals: {} };

/** Build a ticker→signal map from a signal array (uppercased keys). */
export function indexSignals(signals: TimingSignal[] | undefined): Record<string, TimingSignal> {
  const map: Record<string, TimingSignal> = {};
  for (const s of signals ?? []) {
    if (s && s.ticker) map[s.ticker.toUpperCase()] = s;
  }
  return map;
}

interface DashboardWire {
  indices?: MarketIndex[];
  brief?: DailyMarketBrief;
  top?: RankedStock[];
  signals?: TimingSignal[];
}

/**
 * Fetch the dashboard payload. Returns {@link EMPTY_DASHBOARD} on any failure
 * (never throws) so the caller can always render the shell.
 */
export const fetchDashboard: DashboardLoader = async () => {
  const base = apiBaseUrl();
  if (!base) return EMPTY_DASHBOARD;
  try {
    const res = await fetch(`${base}/api/market/dashboard`);
    if (!res.ok) return EMPTY_DASHBOARD;
    const wire = (await res.json()) as DashboardWire;
    return {
      indices: Array.isArray(wire.indices) ? wire.indices : [],
      brief: wire.brief,
      top: Array.isArray(wire.top) ? wire.top : [],
      signals: indexSignals(wire.signals),
    };
  } catch {
    return EMPTY_DASHBOARD;
  }
};
