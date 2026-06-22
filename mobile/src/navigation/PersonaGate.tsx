import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PersonaRepository } from "../persona/repository";
import type { PersonaConfig } from "../persona/types";
import { PersonaSetupScreen } from "../screens/PersonaSetupScreen";
import { LoadingView } from "../components/StateViews";
import { addBreadcrumb } from "../resilience/errorLog";
import { trackPersonaSet } from "../analytics/analytics";

export interface PersonaGateProps {
  repository?: PersonaRepository;
  /** Rendered once a persona exists; receives it + an updater that persists. */
  children: (persona: PersonaConfig, onPersonaChange: (c: PersonaConfig) => Promise<void>) => ReactNode;
}

/**
 * First-run gate (SPEC Task 8): the app is blocked until a persona is chosen —
 * there is NO skip. On first run the no-skip PersonaSetupScreen is shown; once a
 * persona is saved (locally), the gated app renders.
 */
export function PersonaGate({ repository, children }: PersonaGateProps) {
  const repo = useMemo(() => repository ?? new PersonaRepository(), [repository]);
  const [status, setStatus] = useState<"loading" | "needsSetup" | "ready">("loading");
  const [persona, setPersona] = useState<PersonaConfig | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const existing = await repo.load();
      if (!active) return;
      setPersona(existing);
      setStatus(existing ? "ready" : "needsSetup");
    })();
    return () => {
      active = false;
    };
  }, [repo]);

  const save = useCallback(
    async (config: PersonaConfig) => {
      const firstRun = status !== "ready";
      await repo.save(config);
      addBreadcrumb(`persona set (${config.mode})`);
      trackPersonaSet(config.mode, firstRun); // funnel: first-run persona set
      setPersona(config);
      setStatus("ready");
    },
    [repo, status],
  );

  if (status === "loading") return <LoadingView />;
  if (status === "needsSetup" || !persona) {
    return <PersonaSetupScreen mode="first-run" onSave={save} />;
  }
  return <>{children(persona, save)}</>;
}
