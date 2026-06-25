/**
 * useDiscovery — 발굴 탭 데이터 로드 (시장 토글 → /api/discover → 상태머신).
 * 에러는 친절한 한국어로 표면화, 렌더 트리에 throw ✗ (RESILIENCE 정합).
 */

import { useCallback, useEffect, useState } from "react";
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
  const [market, setMarket] = useState<DiscoveryMarket>(opts.initialMarket ?? "US");
  const [status, setStatus] = useState<DiscoveryStatus>("loading");
  const [artifact, setArtifact] = useState<DiscoveryArtifact | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setErrorMessage(undefined);
    loader(market)
      .then((data) => {
        if (!active) return;
        setArtifact(data);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!active) return;
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
