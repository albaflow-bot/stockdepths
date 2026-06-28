/**
 * priceChart 기하 단위테스트 — 정규화(0..1)·방향 부호. 순수 함수라 결정적.
 */

import { describe, it, expect } from "vitest";
import { priceChartFractions, priceChartTrend, scrubIndex } from "./priceChart";

describe("priceChartFractions", () => {
  it("종가를 min..max 기준 0..1 로 정규화한다", () => {
    expect(priceChartFractions([10, 20, 30])).toEqual([0, 0.5, 1]);
  });

  it("모든 값이 같으면 평평한 0.5", () => {
    expect(priceChartFractions([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
  });

  it("빈/단일 점은 빈 배열(차트 자리만)", () => {
    expect(priceChartFractions([])).toEqual([]);
    expect(priceChartFractions([42])).toEqual([]);
  });

  it("비유한 값(NaN/Infinity)은 걸러낸다", () => {
    expect(priceChartFractions([10, NaN, 30])).toEqual([0, 1]);
  });
});

describe("priceChartTrend", () => {
  it("끝-시작 부호: 상승은 양수", () => {
    expect(priceChartTrend([10, 30])).toBeGreaterThan(0);
  });
  it("하락은 음수", () => {
    expect(priceChartTrend([30, 10])).toBeLessThan(0);
  });
  it("부족 데이터는 0(보합)", () => {
    expect(priceChartTrend([5])).toBe(0);
  });
});

describe("scrubIndex (막대 터치 → 인덱스)", () => {
  it("터치 x 비율로 인덱스 매핑 (0..n-1)", () => {
    // 너비 100, 10개 점(인덱스 0..9): x=0→0, x=100→9, x=50→약 중앙.
    expect(scrubIndex(0, 100, 10)).toBe(0);
    expect(scrubIndex(100, 100, 10)).toBe(9);
    expect(scrubIndex(50, 100, 10)).toBe(5);
  });
  it("범위를 벗어난 x 는 클램프", () => {
    expect(scrubIndex(-20, 100, 10)).toBe(0);
    expect(scrubIndex(999, 100, 10)).toBe(9);
  });
  it("너비 0/단일 점은 0", () => {
    expect(scrubIndex(50, 0, 10)).toBe(0);
    expect(scrubIndex(50, 100, 1)).toBe(0);
  });
});
