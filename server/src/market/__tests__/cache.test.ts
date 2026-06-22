import { describe, it, expect } from "vitest";
import { TtlCache } from "../cache.js";

function clockFrom(start: number) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("TtlCache", () => {
  it("returns a fresh value and undefined after TTL expiry", () => {
    const clk = clockFrom(1000);
    const cache = new TtlCache({ dir: null, now: clk.now, defaultTtlMs: 100 });
    cache.set("k", { v: 1 });
    expect(cache.get<{ v: number }>("k")).toEqual({ v: 1 });
    clk.advance(150);
    expect(cache.get("k")).toBeUndefined();
  });

  it("respects a per-entry TTL override", () => {
    const clk = clockFrom(0);
    const cache = new TtlCache({ dir: null, now: clk.now, defaultTtlMs: 10 });
    cache.set("k", 1, 1000);
    clk.advance(500);
    expect(cache.get("k")).toBe(1);
  });

  it("serves stale values via getStale after expiry", () => {
    const clk = clockFrom(0);
    const cache = new TtlCache({ dir: null, now: clk.now, defaultTtlMs: 10 });
    cache.set("k", "old");
    clk.advance(9999);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.getStale<string>("k")).toBe("old");
  });

  it("disabling disk (dir:null) keeps everything in memory only", () => {
    const cache = new TtlCache({ dir: null });
    cache.set("x", 42);
    expect(cache.get("x")).toBe(42);
  });
});
