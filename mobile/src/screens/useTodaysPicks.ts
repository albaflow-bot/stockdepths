import { useCallback, useEffect, useState } from "react";
import { fetchTodaysPicks } from "../data/picksClient";
import { addBreadcrumb } from "../resilience/errorLog";
import type { DailyPicksArtifact } from "../types/picks";

export type PicksStatus = "loading" | "ready" | "empty" | "error";

export type ArtifactLoader = () => Promise<DailyPicksArtifact>;

export interface TodaysPicksState {
  status: PicksStatus;
  artifact?: DailyPicksArtifact;
  errorMessage?: string;
  reload: () => void;
}

/**
 * Loads today's picks via the injected loader (defaults to the real client).
 * Maps the result to a small state machine the screen renders. Errors are
 * surfaced as a friendly message, never thrown to the render tree.
 */
export function useTodaysPicks(loader: ArtifactLoader = fetchTodaysPicks): TodaysPicksState {
  const [status, setStatus] = useState<PicksStatus>("loading");
  const [artifact, setArtifact] = useState<DailyPicksArtifact | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setErrorMessage(undefined);
    addBreadcrumb("load today's picks");
    loader()
      .then((data) => {
        if (!active) return;
        setArtifact(data);
        setStatus(data.picks.length > 0 ? "ready" : "empty");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setArtifact(undefined);
        setErrorMessage(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [loader, nonce]);

  return { status, artifact, errorMessage, reload };
}
