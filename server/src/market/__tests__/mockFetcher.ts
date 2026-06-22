import type { Fetcher } from "../http.js";

export interface Route {
  /** Substring matched against the request URL. */
  match: string;
  body?: string;
  status?: number;
  /** If set, the route throws (simulates a network error). */
  throws?: boolean;
}

export interface MockFetcher extends Fetcher {
  calls: string[];
}

/**
 * Deterministic fetcher: routes by URL substring, records calls. The first
 * matching route wins. Unmatched URLs resolve to 404. No network, no timing.
 */
export function makeMockFetcher(routes: Route[]): MockFetcher {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const route = routes.find((r) => url.includes(r.match));
    if (!route) {
      return { ok: false, status: 404, text: async () => "not found" };
    }
    if (route.throws) {
      throw new Error(`simulated network error for ${url}`);
    }
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => route.body ?? "" };
  }) as MockFetcher;
  fn.calls = calls;
  return fn;
}
