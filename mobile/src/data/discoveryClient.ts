/**
 * 발굴 탭 클라이언트 (서버 GET /api/discover — SPEC §3.2-Δ 발굴 탭). 일배치가 적재한
 * 최신 카테고리 아티팩트를 받아온다. 미설정/네트워크/비정상/미생성(404)은 친절한 한국어
 * 메시지로 degrade (RESILIENCE 정합).
 */

import { apiBaseUrl } from "./config";
import type { DiscoveryArtifact } from "../types/discovery";

export class DiscoveryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryUnavailableError";
  }
}

export type DiscoveryMarket = "US" | "KR";
export type DiscoveryLoader = (market: DiscoveryMarket) => Promise<DiscoveryArtifact>;

/** 최신 발굴 아티팩트를 가져온다. 미생성/오류 시 DiscoveryUnavailableError. */
export const fetchDiscovery: DiscoveryLoader = async (market) => {
  const base = apiBaseUrl();
  if (!base) {
    throw new DiscoveryUnavailableError("발굴 서버가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }
  let res: Response;
  try {
    res = await fetch(`${base}/api/discover?market=${encodeURIComponent(market)}`);
  } catch {
    throw new DiscoveryUnavailableError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (res.status === 404) {
    throw new DiscoveryUnavailableError("투데이 결과가 아직 준비되지 않았습니다. 장 마감 후 갱신됩니다.");
  }
  if (!res.ok) {
    throw new DiscoveryUnavailableError(`투데이 데이터를 불러오지 못했습니다 (오류 ${res.status}).`);
  }
  return (await res.json()) as DiscoveryArtifact;
};
