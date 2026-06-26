/**
 * 종목 히스토리 클라이언트 (서버 GET /api/history). 일봉 시계열 + 스탯을 받아온다.
 *
 * 다른 클라이언트(securitySearchClient·picksClient·discoveryClient)와 동일 계약:
 * API base 미설정/네트워크/비정상 응답이면 친절한 한국어 메시지를 가진 에러를 던져
 * 상세 화면이 한 줄 안내로 graceful 하게 degrade 한다(RESILIENCE 정합).
 */

import { apiBaseUrl } from "./config";
import type {
  HistoryMarket,
  HistoryPoint,
  HistoryRange,
  HistoryResponse,
  HistoryStats,
} from "../types/history";

export class HistoryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryUnavailableError";
  }
}

export interface HistoryParams {
  symbol: string;
  market: HistoryMarket;
  range?: HistoryRange;
}

export type HistoryLoader = (params: HistoryParams) => Promise<HistoryResponse>;

/** 숫자 또는 null 로 방어적 정규화(필드 누락·문자열 섞임에도 안전). */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** points 를 방어적으로 정규화 — date(string)·close(finite number) 만 통과. */
function normalizePoints(raw: unknown): HistoryPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryPoint[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const close = num(r["close"]);
    if (typeof r["date"] !== "string" || close == null) continue;
    out.push({ date: r["date"], close });
  }
  return out;
}

/** stats 를 방어적으로 정규화 — 누락 필드는 null. */
function normalizeStats(raw: unknown): HistoryStats {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    open: num(r["open"]),
    high: num(r["high"]),
    low: num(r["low"]),
    close: num(r["close"]),
    volume: num(r["volume"]),
    prevClose: num(r["prevClose"]),
    high52: num(r["high52"]),
    low52: num(r["low52"]),
    asOf: typeof r["asOf"] === "string" ? (r["asOf"] as string) : null,
  };
}

/**
 * 종목 일봉 히스토리를 가져온다. range 기본 1M. 미설정/네트워크/비정상은
 * HistoryUnavailableError 로 던져 상세 화면이 한 줄 안내로 degrade 한다.
 */
export const fetchHistory: HistoryLoader = async ({ symbol, market, range = "1M" }) => {
  const base = apiBaseUrl();
  if (!base) {
    throw new HistoryUnavailableError("시세 서버가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }

  const url = `${base}/api/history?symbol=${encodeURIComponent(symbol)}&market=${encodeURIComponent(
    market,
  )}&range=${encodeURIComponent(range)}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new HistoryUnavailableError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (!res.ok) {
    throw new HistoryUnavailableError(`시세를 불러오지 못했습니다 (오류 ${res.status}).`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    symbol: typeof data["symbol"] === "string" ? (data["symbol"] as string) : symbol,
    market: data["market"] === "KR" ? "KR" : "US",
    range: ((): HistoryRange =>
      data["range"] === "5D" ||
      data["range"] === "1M" ||
      data["range"] === "3M" ||
      data["range"] === "1Y" ||
      data["range"] === "5Y"
        ? (data["range"] as HistoryRange)
        : range)(),
    points: normalizePoints(data["points"]),
    stats: normalizeStats(data["stats"]),
  };
};
