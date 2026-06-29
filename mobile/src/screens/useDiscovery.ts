/**
 * useDiscovery — 발굴 탭 데이터 로드 (시장 토글 → /api/discover → 상태머신).
 * 에러는 친절한 한국어로 표면화, 렌더 트리에 throw ✗ (RESILIENCE 정합).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDiscovery, type DiscoveryLoader, type DiscoveryMarket } from "../data/discoveryClient";
import type { DiscoveryArtifact } from "../types/discovery";

export type DiscoveryStatus = "loading" | "ready" | "error";

export interface DiscoveryState {
  market: DiscoveryMarket;
  setMarket: (m: DiscoveryMarket) => void;
  status: DiscoveryStatus;
  artifact?: DiscoveryArtifact;
  errorMessage?: string;
  reload: () => void;
}

export interface UseDiscoveryOptions {
  loader?: DiscoveryLoader;
  initialMarket?: DiscoveryMarket;
}

export function useDiscovery(opts: UseDiscoveryOptions = {}): DiscoveryState {
  const loader = opts.loader ?? fetchDiscovery;
  // 한국 우선 앱 — 투데이는 한국 탭으로 시작.
  const [market, setMarket] = useState<DiscoveryMarket>(opts.initialMarket ?? "KR");
  const [status, setStatus] = useState<DiscoveryStatus>("loading");
  const [artifact, setArtifact] = useState<DiscoveryArtifact | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  // 시장별 아티팩트 캐시 — 탭 전환 시 즉시 표시(stale-while-revalidate)로 로딩 체감 제거.
  const cacheRef = useRef<Map<DiscoveryMarket, DiscoveryArtifact>>(new Map());

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    const cached = cacheRef.current.get(market);
    if (cached) {
      // 캐시 즉시 표시(스피너 없이) — 뒤에서 백그라운드로 최신화.
      setArtifact(cached);
      setStatus("ready");
      setErrorMessage(undefined);
    } else {
      setArtifact(undefined);
      setStatus("loading");
      setErrorMessage(undefined);
    }
    loader(market)
      .then((data) => {
        if (!active) return;
        cacheRef.current.set(market, data);
        setArtifact(data);
        setStatus("ready");
        setErrorMessage(undefined);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (cacheRef.current.has(market)) return; // 캐시 있으면 그대로 유지(일시 오류 무시)
        setArtifact(undefined);
        setErrorMessage(err instanceof Error ? err.message : "발굴 데이터를 불러오지 못했습니다.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [loader, market, nonce]);

  return { market, setMarket, status, artifact, errorMessage, reload };
}
