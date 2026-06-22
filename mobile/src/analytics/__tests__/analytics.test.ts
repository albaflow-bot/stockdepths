import { describe, it, expect, vi, afterEach } from "vitest";
import {
  track,
  trackPersonaSet,
  trackPickView,
  trackAlertOptIn,
  setAnalyticsTransport,
  createPlausibleTransport,
  type AnalyticsProps,
  type JsonFetcher,
} from "../analytics";

afterEach(() => setAnalyticsTransport(null));

describe("track", () => {
  it("is a safe no-op (no throw) when analytics is not configured", () => {
    setAnalyticsTransport(null);
    expect(() => track("anything", { a: 1 })).not.toThrow();
  });

  it("routes events + props through the configured transport", () => {
    const calls: Array<{ event: string; props: AnalyticsProps }> = [];
    setAnalyticsTransport((event, props) => void calls.push({ event, props }));

    trackPersonaSet("preset", true);
    trackPickView(4);
    trackAlertOptIn();

    expect(calls).toEqual([
      { event: "persona_set", props: { mode: "preset", first_run: true } },
      { event: "pick_view", props: { count: 4 } },
      { event: "alert_opt_in", props: {} },
    ]);
  });

  it("never throws even if the transport rejects", () => {
    setAnalyticsTransport(() => {
      throw new Error("boom");
    });
    expect(() => track("x")).not.toThrow();
  });
});

describe("createPlausibleTransport", () => {
  it("POSTs a privacy-friendly event to the Plausible API", async () => {
    let captured: { url: string; body: unknown } | undefined;
    const fetcher: JsonFetcher = vi.fn(async (url, init) => {
      captured = { url, body: JSON.parse(init.body) };
      return { ok: true, status: 202 };
    });
    const transport = createPlausibleTransport({ domain: "stock.app", fetcher });
    await transport("pick_view", { count: 3 });

    expect(captured!.url).toBe("https://plausible.io/api/event");
    expect(captured!.body).toEqual({
      name: "pick_view",
      url: "https://stock.app/pick_view",
      domain: "stock.app",
      props: { count: 3 },
    });
  });

  it("honors a custom host", async () => {
    let url = "";
    const fetcher: JsonFetcher = vi.fn(async (u) => {
      url = u;
      return { ok: true, status: 202 };
    });
    const transport = createPlausibleTransport({ domain: "stock.app", host: "https://plausible.example.com", fetcher });
    await transport("persona_set", {});
    expect(url).toBe("https://plausible.example.com/api/event");
  });
});
