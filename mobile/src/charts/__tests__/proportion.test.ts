import { describe, it, expect } from "vitest";
import { clamp01, barFraction, pctWidth, winRateFraction, maxMagnitude } from "../proportion";

describe("clamp01", () => {
  it("clamps to [0,1] and handles non-finite", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe("barFraction", () => {
  it("is |value| / maxAbs, clamped", () => {
    expect(barFraction(5, 10)).toBe(0.5);
    expect(barFraction(-8, 10)).toBe(0.8);
    expect(barFraction(20, 10)).toBe(1); // clamped
  });
  it("is 0 when value is null or max is 0", () => {
    expect(barFraction(null, 10)).toBe(0);
    expect(barFraction(5, 0)).toBe(0);
  });
});

describe("pctWidth", () => {
  it("renders a percentage string", () => {
    expect(pctWidth(0.5)).toBe("50%");
    expect(pctWidth(1.5)).toBe("100%");
    expect(pctWidth(-0.2)).toBe("0%");
  });
});

describe("winRateFraction", () => {
  it("maps 0..100 to 0..1", () => {
    expect(winRateFraction(0)).toBe(0);
    expect(winRateFraction(66.67)).toBeCloseTo(0.6667, 4);
    expect(winRateFraction(100)).toBe(1);
    expect(winRateFraction(null)).toBe(0);
  });
});

describe("maxMagnitude", () => {
  it("returns the largest absolute value, ignoring null", () => {
    expect(maxMagnitude(3, -7, null, 5)).toBe(7);
    expect(maxMagnitude(null, undefined)).toBe(0);
  });
});
