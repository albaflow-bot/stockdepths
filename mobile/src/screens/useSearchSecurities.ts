/**
 * useSearchSecurities — 검색 입력 → 디바운스 → /api/search 호출 → 상태머신.
 *
 * 상태: idle(빈 질의) · loading · ready · empty · error. 에러는 친절한 한국어 메시지로
 * 표면화하고 절대 렌더 트리에 throw 하지 않는다(RESILIENCE 정합). market 필터는 서버
 * 파라미터(재호출), sort 토글은 클라에서 재정렬(거래대금=서버순서 / 등락률=change desc).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { searchSecurities, type SecuritySearchLoader } from "../data/securitySearchClient";
import type { MarketGroup, SearchSort, SecuritySearchItem } from "../types/security";

export type SearchStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface UseSearchSecuritiesOptions {
  loader?: SecuritySearchLoader;
  /** 디바운스(ms). 기본 300. 테스트는 0 으로 즉시. */
  debounceMs?: number;
  limit?: number;
  initialMarket?: MarketGroup;
}

export interface SearchSecuritiesState {
  query: string;
  setQuery: (q: string) => void;
  market: MarketGroup;
  setMarket: (m: MarketGroup) => void;
  sort: SearchSort;
  setSort: (s: SearchSort) => void;
  status: SearchStatus;
  items: SecuritySearchItem[];
  errorMessage?: string;
  /** 동일 질의 재시도. */
  reload: () => void;
}

/** sort 토글 적용: 거래대금=서버순서 유지, 등락률=change_pct desc 재정렬. */
function applySort(items: SecuritySearchItem[], sort: SearchSort): SecuritySearchItem[] {
  if (sort === "turnover") return items; // 서버가 이미 거래대금 desc
  return [...items].sort((a, b) => (b.change_pct ?? -Infinity) - (a.change_pct ?? -Infinity));
}

export function useSearchSecurities(opts: UseSearchSecuritiesOptions = {}): SearchSecuritiesState {
  const loader = opts.loader ?? searchSecurities;
  const debounceMs = opts.debounceMs ?? 300;
  const limit = opts.limit ?? 30;

  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<MarketGroup>(opts.initialMarket ?? "ALL");
  const [sort, setSort] = useState<SearchSort>("turnover");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [raw, setRaw] = useState<SecuritySearchItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) {
      setStatus("idle");
      setRaw([]);
      setErrorMessage(undefined);
      return;
    }
    let active = true;
    setStatus("loading");
    setErrorMessage(undefined);
    const handle = setTimeout(() => {
      loader({ q: trimmed, market, limit })
        .then((results) => {
          if (!active) return;
          setRaw(results);
          setStatus(results.length > 0 ? "ready" : "empty");
        })
        .catch((err: unknown) => {
          if (!active) return;
          setRaw([]);
          setErrorMessage(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
          setStatus("error");
        });
    }, debounceMs);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [trimmed, market, limit, loader, debounceMs, nonce]);

  const items = useMemo(() => applySort(raw, sort), [raw, sort]);

  return { query, setQuery, market, setMarket, sort, setSort, status, items, errorMessage, reload };
}
