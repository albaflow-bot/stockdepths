/**
 * Client for the shared "today's picks" artifact.
 *
 * Reads the API base URL from the environment only (Expo inlines EXPO_PUBLIC_*).
 * When unset or unreachable, throws a `PicksUnavailableError` with a friendly
 * Korean message so the screen degrades gracefully instead of crashing
 * (RESILIENCE / DB BACKEND contracts).
 */

import type { DailyPicksArtifact } from "../types/picks";
import { apiBaseUrl } from "./config";

export class PicksUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PicksUnavailableError";
  }
}

/** Fetch today's shared picks artifact for a market (default US). */
export async function fetchTodaysPicks(market = "US"): Promise<DailyPicksArtifact> {
  const base = apiBaseUrl();
  if (!base) {
    throw new PicksUnavailableError("추천 서버가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }
  let res: Response;
  try {
    res = await fetch(`${base}/api/picks/today?market=${encodeURIComponent(market)}`);
  } catch {
    throw new PicksUnavailableError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (!res.ok) {
    throw new PicksUnavailableError(`추천을 불러오지 못했습니다 (오류 ${res.status}).`);
  }
  return (await res.json()) as DailyPicksArtifact;
}
