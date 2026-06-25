import { describe, it, expect } from "vitest";
import { sparklineFractions, sparklineTrend } from "../sparkline";

describe("sparklineFractions", () => {
  it("min→0, max→1 로 정규화", () => {
    const f = sparklineFractions([10, 20, 30]);
    expect(f[0]).toBe(0);
    expect(f[2]).toBe(1);
    expect(f[1]).toBeCloseTo(0.5, 5);
  });

  it("모두 같으면 평평한 0.5", () => {
    expect(sparklineFractions([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
  });

  it("2개 미만/비유한 값은 빈 배열", () => {
    expect(sparklineFractions([])).toEqual([]);
    expect(sparklineFractions([42])).toEqual([]);
    expect(sparklineFractions([NaN, Infinity])).toEqual([]);
  });
});

describe("sparklineTrend", () => {
  it("마지막-처음 부호", () => {
    expect(sparklineTrend([10, 12])).toBeGreaterThan(0);
    expect(sparklineTrend([12, 10])).toBeLessThan(0);
    expect(sparklineTrend([10, 10])).toBe(0);
    expect(sparklineTrend([5])).toBe(0);
  });
});
