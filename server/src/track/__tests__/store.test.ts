import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrackRecordStore } from "../store.js";
import type { TrackRecordEntry } from "../types.js";

function entry(date: string, symbol: string): TrackRecordEntry {
  return {
    id: `US:${date}:${symbol}`,
    market: "US",
    date,
    symbol,
    confidence: "medium",
    risk: "medium",
    rationale: "테스트",
    entryPrice: 100,
    entryPriceDate: date,
    benchmarkSymbol: "SPY",
    benchmarkEntryPrice: 400,
    benchmarkEntryDate: date,
    loggedAt: "2024-06-21T00:00:00.000Z",
  };
}

describe("TrackRecordStore (in-memory)", () => {
  it("appends entries and reads them back sorted by date then symbol", () => {
    const s = new TrackRecordStore({ file: null });
    s.append([entry("2024-06-10", "MSFT"), entry("2024-06-01", "AAPL")]);
    const all = s.readAll();
    expect(all.map((e) => e.symbol)).toEqual(["AAPL", "MSFT"]);
  });

  it("is idempotent by id — re-appending the same entry is a no-op", () => {
    const s = new TrackRecordStore({ file: null });
    expect(s.append([entry("2024-06-01", "AAPL")])).toHaveLength(1);
    expect(s.append([entry("2024-06-01", "AAPL")])).toHaveLength(0); // dup skipped
    expect(s.readAll()).toHaveLength(1);
  });

  it("readSince filters by recommendation date", () => {
    const s = new TrackRecordStore({ file: null });
    s.append([entry("2024-01-01", "AAPL"), entry("2024-06-01", "MSFT")]);
    expect(s.readSince("2024-05-01").map((e) => e.symbol)).toEqual(["MSFT"]);
  });
});

describe("TrackRecordStore (append-only file)", () => {
  const file = join(tmpdir(), `trk-test-${Math.random().toString(36).slice(2)}.jsonl`);
  afterEach(() => {
    if (existsSync(file)) rmSync(file);
  });

  it("persists across instances and never rewrites prior lines", () => {
    const s1 = new TrackRecordStore({ file });
    s1.append([entry("2024-06-01", "AAPL")]);
    const afterFirst = readFileSync(file, "utf8");

    // A new instance reads the persisted history.
    const s2 = new TrackRecordStore({ file });
    expect(s2.readAll()).toHaveLength(1);

    // Idempotent across instances: re-appending the same id writes nothing new.
    expect(s2.append([entry("2024-06-01", "AAPL")])).toHaveLength(0);
    expect(readFileSync(file, "utf8")).toBe(afterFirst); // file unchanged

    // A genuinely new entry only appends (prior content preserved as a prefix).
    s2.append([entry("2024-06-02", "MSFT")]);
    const afterSecond = readFileSync(file, "utf8");
    expect(afterSecond.startsWith(afterFirst)).toBe(true);
    expect(new TrackRecordStore({ file }).readAll()).toHaveLength(2);
  });

  it("skips corrupt lines instead of failing the read", () => {
    const s = new TrackRecordStore({ file });
    s.append([entry("2024-06-01", "AAPL")]);
    // Append a junk line directly to simulate corruption.
    appendFileSync(file, "not json\n", "utf8");
    expect(new TrackRecordStore({ file }).readAll()).toHaveLength(1);
  });
});
