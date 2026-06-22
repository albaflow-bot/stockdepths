import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeviceTokenStore } from "../tokenStore.js";

describe("DeviceTokenStore (in-memory)", () => {
  it("registers, dedupes by token, and lists", () => {
    const s = new DeviceTokenStore({ file: null });
    s.register("tok-a", "android", "2026-06-21T09:00:00Z");
    s.register("tok-b", "android", "2026-06-21T09:00:00Z");
    s.register("tok-a", "android", "2026-06-22T09:00:00Z"); // refresh, not a dup
    expect(s.listTokens().sort()).toEqual(["tok-a", "tok-b"]);
    expect(s.list().find((t) => t.token === "tok-a")!.registeredAt).toBe("2026-06-22T09:00:00Z");
  });

  it("removes tokens (unregister / prune) and reports the count", () => {
    const s = new DeviceTokenStore({ file: null });
    s.register("a", "android", "t");
    s.register("b", "android", "t");
    expect(s.remove(["a", "missing"])).toBe(1);
    expect(s.listTokens()).toEqual(["b"]);
  });

  it("ignores empty tokens", () => {
    const s = new DeviceTokenStore({ file: null });
    s.register("", "android", "t");
    expect(s.listTokens()).toHaveLength(0);
  });
});

describe("DeviceTokenStore (file)", () => {
  const file = join(tmpdir(), `dtok-${Math.random().toString(36).slice(2)}.json`);
  afterEach(() => {
    if (existsSync(file)) rmSync(file);
  });

  it("persists across instances", () => {
    const s1 = new DeviceTokenStore({ file });
    s1.register("tok-a", "android", "t");
    expect(new DeviceTokenStore({ file }).listTokens()).toEqual(["tok-a"]);
  });

  it("persists removals", () => {
    const s1 = new DeviceTokenStore({ file });
    s1.register("a", "android", "t");
    s1.register("b", "android", "t");
    s1.remove(["a"]);
    expect(new DeviceTokenStore({ file }).listTokens()).toEqual(["b"]);
  });
});
