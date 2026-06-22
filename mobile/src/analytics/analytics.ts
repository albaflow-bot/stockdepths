/**
 * Privacy-friendly usage analytics (SPEC Task 13).
 *
 * Uses Plausible — no cookies, no cross-site tracking, no personal data. We send
 * only coarse funnel event names + non-identifying props (e.g. a pick count). It
 * is configured via env (EXPO_PUBLIC_PLAUSIBLE_DOMAIN); when unconfigured, all
 * tracking is a safe no-op. `track` never throws — analytics must never break a
 * user flow (RESILIENCE CONTRACT).
 */

export type AnalyticsProps = Record<string, string | number | boolean>;
export type AnalyticsTransport = (event: string, props: AnalyticsProps) => void | Promise<void>;

/** Minimal injectable fetch shape. */
export type JsonFetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export interface PlausibleConfig {
  domain: string;
  host?: string;
  fetcher?: JsonFetcher;
}

/** Build a Plausible event transport. Exposed for testing. */
export function createPlausibleTransport(config: PlausibleConfig): AnalyticsTransport {
  const host = (config.host ?? "https://plausible.io").replace(/\/+$/, "");
  const resolveFetcher = (): JsonFetcher => {
    if (config.fetcher) return config.fetcher;
    return globalThis.fetch as unknown as JsonFetcher;
  };
  return async (event, props) => {
    await resolveFetcher()(`${host}/api/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: event,
        url: `https://${config.domain}/${event}`,
        domain: config.domain,
        props,
      }),
    });
  };
}

function envConfig(): PlausibleConfig | null {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const domain = g.process?.env?.["EXPO_PUBLIC_PLAUSIBLE_DOMAIN"];
  if (!domain) return null;
  const host = g.process?.env?.["EXPO_PUBLIC_PLAUSIBLE_HOST"];
  return { domain, ...(host ? { host } : {}) };
}

let override: AnalyticsTransport | null = null;
let defaultTransport: AnalyticsTransport | null | undefined;

/** Override the transport (tests, or a custom analytics backend). Pass null to clear. */
export function setAnalyticsTransport(transport: AnalyticsTransport | null): void {
  override = transport;
}

function resolveTransport(): AnalyticsTransport | null {
  if (override) return override;
  if (defaultTransport === undefined) {
    const cfg = envConfig();
    defaultTransport = cfg ? createPlausibleTransport(cfg) : null;
  }
  return defaultTransport;
}

/** Fire-and-forget event tracking. Never throws. */
export function track(event: string, props: AnalyticsProps = {}): void {
  try {
    const transport = resolveTransport();
    if (!transport) return; // analytics disabled
    void Promise.resolve(transport(event, props)).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}

// --- Key funnel events (SPEC Task 13) -------------------------------------

/** First-run (or edited) persona selection. */
export function trackPersonaSet(mode: string, firstRun: boolean): void {
  track("persona_set", { mode, first_run: firstRun });
}

/** The user viewed today's picks. */
export function trackPickView(count: number): void {
  track("pick_view", { count });
}

/** The user opted in to push/alerts. */
export function trackAlertOptIn(): void {
  track("alert_opt_in", {});
}
