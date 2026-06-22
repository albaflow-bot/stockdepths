/**
 * Scorecard client — fetches the derived scorecard (server Task 4) for an `asOf`
 * date. Reads the API base from env; on no base / network / non-OK it throws a
 * friendly ScorecardUnavailableError so the screen degrades gracefully.
 */

import { apiBaseUrl } from "./config";
import type { Scorecard } from "../types/scorecard";

export class ScorecardUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScorecardUnavailableError";
  }
}

export type ScorecardLoader = (asOf?: string) => Promise<Scorecard>;

export const fetchScorecard: ScorecardLoader = async (asOf) => {
  const base = apiBaseUrl();
  if (!base) {
    throw new ScorecardUnavailableError("성적표 서버가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }
  const query = asOf ? `?asOf=${encodeURIComponent(asOf)}` : "";
  let res: Response;
  try {
    res = await fetch(`${base}/api/scorecard${query}`);
  } catch {
    throw new ScorecardUnavailableError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (!res.ok) {
    throw new ScorecardUnavailableError(`성적표를 불러오지 못했습니다 (오류 ${res.status}).`);
  }
  return (await res.json()) as Scorecard;
};
