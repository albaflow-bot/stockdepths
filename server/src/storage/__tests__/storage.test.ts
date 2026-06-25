import { describe, it, expect } from "vitest";
import { readSupabaseConfig, type FetchLike } from "../supabaseRest.js";
import { SupabaseArtifactStore } from "../supabaseArtifactStore.js";
import { SupabaseTrackStore } from "../supabaseTrackStore.js";
import { SupabaseDeviceTokenStore } from "../supabaseTokenStore.js";
import type { DailyPicksArtifact } from "../../pipeline/artifactStore.js";
import type { TrackRecordEntry } from "../../track/types.js";

const CFG = { url: "https://proj.supabase.co", key: "test-key" };

interface Call {
  url: string;
  init: RequestInit;
}

/** A fake fetch that records calls and returns whatever the handler produces. */
function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; json?: unknown }): {
  fetch: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    const r = handler(url, init);
    const body = r.json === undefined ? "" : JSON.stringify(r.json);
    return new Response(body, { status: r.status ?? 200 });
  };
  return { fetch, calls };
}

function sampleArtifact(): DailyPicksArtifact {
  return {
    market: "US",
    date: "2026-06-23",
    generatedAt: "2026-06-23T13:00:00.000Z",
    picks: [],
    marketContext: "테스트",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    disclaimer: "AI는 보장이 아닌 참고 조언입니다.",
    universe: ["AAPL"],
  };
}

function sampleEntry(): TrackRecordEntry {
  return {
    id: "US:2026-06-23:AAPL",
    market: "US",
    date: "2026-06-23",
    symbol: "AAPL",
    confidence: "high",
    risk: "low",
    rationale: "테스트",
    entryPrice: 100,
    entryPriceDate: "2026-06-23",
    benchmarkSymbol: "SPY",
    benchmarkEntryPrice: 500,
    benchmarkEntryDate: "2026-06-23",
    loggedAt: "2026-06-23T13:00:00.000Z",
  };
}

describe("readSupabaseConfig", () => {
  it("returns null when unconfigured", () => {
    expect(readSupabaseConfig({})).toBeNull();
  });

  it("prefers the service-role key and trims a trailing slash", () => {
    const cfg = readSupabaseConfig({
      SUPABASE_URL: "https://proj.supabase.co/",
      SUPABASE_SERVICE_ROLE_KEY: "svc",
      SUPABASE_ANON_KEY: "anon",
    });
    expect(cfg).toEqual({ url: "https://proj.supabase.co", key: "svc" });
  });
});

describe("SupabaseArtifactStore", () => {
  it("hydrate() loads a row so the synchronous get() returns it", async () => {
    const artifact = sampleArtifact();
    const { fetch, calls } = fakeFetch(() => ({ json: [{ data: artifact }] }));
    const store = new SupabaseArtifactStore(CFG, fetch);

    expect(store.get("US", "2026-06-23")).toBeUndefined();
    await store.hydrate("US", "2026-06-23");
    expect(store.get("US", "2026-06-23")).toEqual(artifact);
    expect(calls[0]!.init.method).toBe("GET");
  });

  it("put() queues an upsert that flush() awaits", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: null }));
    const store = new SupabaseArtifactStore(CFG, fetch);

    store.put(sampleArtifact());
    await store.flush(); // flush awaits the queued upsert
    expect(calls.length).toBe(1);
    expect(calls[0]!.init.method).toBe("POST");
    expect(String((calls[0]!.init.headers as Record<string, string>)["Prefer"])).toContain(
      "merge-duplicates",
    );
  });
});

describe("SupabaseTrackStore", () => {
  it("append() mirrors in memory and flush() inserts; dedupes by id", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: null }));
    const store = new SupabaseTrackStore(CFG, fetch);

    const fresh = store.append([sampleEntry()]);
    expect(fresh).toHaveLength(1);
    expect(store.readAll()).toHaveLength(1);

    // Re-appending the same id is a no-op (idempotent).
    expect(store.append([sampleEntry()])).toHaveLength(0);

    await store.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe("POST");
  });
});

describe("SupabaseDeviceTokenStore", () => {
  it("hydrate() loads tokens; list()/listTokens() read the mirror", async () => {
    const { fetch } = fakeFetch(() => ({
      json: [{ token: "abc", platform: "android", registered_at: "2026-06-23T00:00:00.000Z" }],
    }));
    const store = new SupabaseDeviceTokenStore(CFG, fetch);
    await store.hydrate();
    expect(store.listTokens()).toEqual(["abc"]);
  });

  it("register() upserts and remove() deletes; flush() awaits both", async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: null }));
    const store = new SupabaseDeviceTokenStore(CFG, fetch);

    store.register("tok1", "android", "2026-06-23T00:00:00.000Z");
    expect(store.listTokens()).toEqual(["tok1"]);
    expect(store.remove(["tok1"])).toBe(1);
    expect(store.listTokens()).toEqual([]);

    await store.flush();
    const methods = calls.map((c) => c.init.method);
    expect(methods).toContain("POST"); // upsert
    expect(methods).toContain("DELETE"); // prune
  });
});
