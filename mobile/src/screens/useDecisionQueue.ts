import { useCallback, useEffect, useMemo, useState } from "react";
import { DecisionRepository } from "../decisions/repository";
import type { DecisionItem, DecisionStatus } from "../decisions/types";

export interface UseDecisionQueueDeps {
  repository?: DecisionRepository;
}

export interface DecisionQueueController {
  status: "loading" | "ready";
  items: DecisionItem[];
  openCount: number;
  decide: (id: string, status: DecisionStatus) => Promise<void>;
}

/** Loads the on-device decision queue and exposes the three-action decide(). */
export function useDecisionQueue(deps: UseDecisionQueueDeps = {}): DecisionQueueController {
  const repo = useMemo(() => deps.repository ?? new DecisionRepository(), [deps.repository]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [items, setItems] = useState<DecisionItem[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await repo.list();
      if (!active) return;
      setItems(list);
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, [repo]);

  const decide = useCallback(
    async (id: string, next: DecisionStatus) => {
      setItems(await repo.setStatus(id, next));
    },
    [repo],
  );

  const openCount = items.filter((i) => i.status === "open").length;
  return { status, items, openCount, decide };
}
