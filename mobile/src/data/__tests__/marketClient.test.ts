import { describe, it, expect } from "vitest";
import {
  MarketIndexCacheRepository,
  refreshIndices,
  MarketDataUnavailableError,
} from "../marketClient";
import { createMemoryStorage } from "../storage";
import type { MarketIndex } from "../../types/market";

function idx(symbol: string, changePercent: number): MarketIndex {
  return {
    symbol,
    name: symbol,
    market: "KR",
    price: 100,
    previousClose: 99,
    change: 1,
    changePercent,
    asOf: "2026-06-24",
    delayed: true,
    source: "yahoo",
  };
}

describe("MarketIndexCacheRepository", () => {
  it("saves and loads the last good value", async () => {
    const repo = new MarketIndexCacheRepository({ storage: createMemoryStorage() });
    expect(await repo.load()).toBeNull();
    await repo.save([idx("^KS11", 1.2)], "2026-06-24T09:00:00Z");
    const loaded = await repo.load();
    expect(loaded?.indices.map((i) => i.symbol)).toEqual(["^KS11"]);
    expect(loaded?.cachedAt).toBe("2026-06-24T09:00:00Z");
  });

  it("returns null on a corrupt cache (never throws)", async () => {
    const storage = createMemoryStorage();
    await storage.setItem("bindesk:market-indices", "{not json");
    const repo = new MarketIndexCacheRepository({ storage });
    expect(await repo.load()).toBeNull();
  });
});

describe("refreshIndices (cache-first)", () => {
  it("fetches fresh, writes the cache, and reports not stale", async () => {
    const repo = new MarketIndexCacheRepository({ storage: createMemoryStorage() });
    const fresh = [idx("^KS11", 2)];
    const r = await refreshIndices(repo, async () => fresh, () => "2026-06-24T09:00:00Z");
    expect(r.stale).toBe(false);
    expect(r.indices).toEqual(fresh);
    expect((await repo.load())?.indices).toEqual(fresh); // cache warmed
  });

  it("falls back to the cached value (flagged stale) when the live fetch fails", async () => {
    const repo = new MarketIndexCacheRepository({ storage: createMemoryStorage() });
    await repo.save([idx("^KS11", 1)], "2026-06-23T09:00:00Z");
    const r = await refreshIndices(repo, async () => {
      throw new MarketDataUnavailableError("down");
    });
    expect(r.stale).toBe(true);
    expect(r.indices.map((i) => i.symbol)).toEqual(["^KS11"]); // last good value, never blank
  });

  it("returns an empty (stale) set when the fetch fails and there is no cache", async () => {
    const repo = new MarketIndexCacheRepository({ storage: createMemoryStorage() });
    const r = await refreshIndices(repo, async () => {
      throw new Error("boom");
    });
    expect(r).toEqual({ indices: [], stale: true });
  });
});
