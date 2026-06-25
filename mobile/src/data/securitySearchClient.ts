/**
 * 종목 검색 클라이언트 (서버 GET /api/search — SPEC §3.2-Δ C). 한글/영문/코드 부분일치.
 *
 * 다른 클라이언트와 동일 계약: API base 미설정/네트워크/비정상 응답이면 친절한 한국어
 * 메시지를 가진 에러를 던져 화면이 graceful 하게 degrade (RESILIENCE 정합).
 */

import { apiBaseUrl } from "./config";
import type { MarketGroup, SecuritySearchItem } from "../types/security";

export class SecuritySearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecuritySearchUnavailableError";
  }
}

export interface SearchParams {
  q: string;
  market?: MarketGroup;
  limit?: number;
}

export type SecuritySearchLoader = (params: SearchParams) => Promise<SecuritySearchItem[]>;

/** 응답 한 항목을 방어적으로 정규화 (필드 누락 시에도 렌더 안전). */
function normalizeItem(raw: unknown): SecuritySearchItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["market"] !== "string" || typeof r["code"] !== "string") return null;
  const dir = r["direction"];
  return {
    market: r["market"] as SecuritySearchItem["market"],
    code: r["code"] as string,
    name_ko: typeof r["name_ko"] === "string" ? (r["name_ko"] as string) : null,
    name_en: typeof r["name_en"] === "string" ? (r["name_en"] as string) : null,
    last: typeof r["last"] === "number" ? (r["last"] as number) : null,
    change_pct: typeof r["change_pct"] === "number" ? (r["change_pct"] as number) : null,
    direction: dir === "up" || dir === "down" ? dir : "flat",
    weekly: Array.isArray(r["weekly"]) ? (r["weekly"] as number[]).filter((n) => typeof n === "number") : [],
    signal:
      r["signal"] && typeof r["signal"] === "object"
        ? {
            label: String((r["signal"] as Record<string, unknown>)["label"] ?? ""),
            reason: String((r["signal"] as Record<string, unknown>)["reason"] ?? ""),
          }
        : null,
  };
}

/**
 * 종목 검색. 빈 질의는 호출 없이 빈 배열(서버 왕복 절약). 결과는 서버가 거래대금 desc
 * 로 정렬해 내려준다(클라는 토글 시 재정렬만).
 */
export const searchSecurities: SecuritySearchLoader = async ({ q, market = "ALL", limit = 30 }) => {
  const query = q.trim();
  if (!query) return [];

  const base = apiBaseUrl();
  if (!base) {
    throw new SecuritySearchUnavailableError("검색 서버가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }

  const url = `${base}/api/search?q=${encodeURIComponent(query)}&market=${encodeURIComponent(
    market,
  )}&limit=${encodeURIComponent(String(limit))}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new SecuritySearchUnavailableError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (!res.ok) {
    throw new SecuritySearchUnavailableError(`검색에 실패했습니다 (오류 ${res.status}).`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data.map(normalizeItem).filter((i): i is SecuritySearchItem => i != null);
};
