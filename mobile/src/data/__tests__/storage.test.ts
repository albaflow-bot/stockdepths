import { describe, it, expect } from "vitest";
import { createMemoryStorage, defaultStorage, setDefaultStorage } from "../storage";

describe("createMemoryStorage", () => {
  it("round-trips and removes values", async () => {
    const s = createMemoryStorage();
    expect(await s.getItem("k")).toBeNull();
    await s.setItem("k", "v");
    expect(await s.getItem("k")).toBe("v");
    await s.removeItem("k");
    expect(await s.getItem("k")).toBeNull();
  });
});

describe("defaultStorage", () => {
  it("returns a usable async storage in the test environment (jsdom localStorage)", async () => {
    const s = defaultStorage();
    await s.setItem("bindesk:test", "1");
    expect(await s.getItem("bindesk:test")).toBe("1");
    await s.removeItem("bindesk:test");
  });

  it("setDefaultStorage overrides the process-wide default (native AsyncStorage path)", async () => {
    const injected = createMemoryStorage();
    setDefaultStorage(injected);
    await defaultStorage().setItem("k", "v");
    // The injected store received the write.
    expect(await injected.getItem("k")).toBe("v");
  });
});
