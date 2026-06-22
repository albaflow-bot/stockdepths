import { useCallback, useEffect, useState } from "react";
import { fetchScorecard, type ScorecardLoader } from "../data/scorecardClient";
import { addBreadcrumb } from "../resilience/errorLog";
import type { Scorecard } from "../types/scorecard";

export type ScorecardStatus = "loading" | "ready" | "error";

export interface ScorecardState {
  status: ScorecardStatus;
  scorecard?: Scorecard;
  errorMessage?: string;
  reload: () => void;
}

/** Loads the scorecard via the injected loader (defaults to the real client). */
export function useScorecard(loader: ScorecardLoader = fetchScorecard): ScorecardState {
  const [status, setStatus] = useState<ScorecardStatus>("loading");
  const [scorecard, setScorecard] = useState<Scorecard | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setErrorMessage(undefined);
    addBreadcrumb("load scorecard");
    loader()
      .then((data) => {
        if (!active) return;
        setScorecard(data);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMessage(err instanceof Error ? err.message : "성적표를 불러오지 못했습니다.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [loader, nonce]);

  return { status, scorecard, errorMessage, reload };
}
