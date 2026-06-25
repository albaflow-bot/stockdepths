import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimingAccuracyPanel } from "../TimingAccuracyPanel";
import type { TimingAccuracyMetrics } from "../../types/scorecard";

function metrics(over: Partial<TimingAccuracyMetrics> = {}): TimingAccuracyMetrics {
  return {
    period: "1M",
    periodStart: "2026-05-30",
    asOf: "2026-06-30",
    horizonDays: 7,
    buy: { total: 6, evaluated: 6, hits: 4, hitRatePct: 66.67 },
    sell: { total: 4, evaluated: 4, hits: 3, hitRatePct: 75 },
    overall: { total: 10, evaluated: 10, hits: 7, hitRatePct: 70 },
    lowSample: false,
    ...over,
  };
}

describe("TimingAccuracyPanel", () => {
  it("shows Buy→상승 and Sell→하락 회피 hit rates with counts (infographic)", () => {
    render(<TimingAccuracyPanel metrics={metrics()} criterion="신호일 종가 대비 7일 후 종가 기준" />);
    expect(screen.getByText("매수 → 상승 적중")).toBeInTheDocument();
    expect(screen.getByText("매도 → 하락 회피")).toBeInTheDocument();
    expect(screen.getByTestId("timing-accuracy-buy-rate")).toHaveTextContent("66.67%");
    expect(screen.getByTestId("timing-accuracy-sell-rate")).toHaveTextContent("75%");
    expect(screen.getByText("6건 평가 중 4건 적중")).toBeInTheDocument();
  });

  it("surfaces the explicit hit criterion for transparency", () => {
    render(<TimingAccuracyPanel metrics={metrics()} criterion="신호일 종가 대비 7일 후 종가 기준" />);
    expect(screen.getByTestId("timing-accuracy-criterion").textContent).toContain("적중 기준");
    expect(screen.getByTestId("timing-accuracy-criterion").textContent).toContain("7일 후");
  });

  it("flags 표본 부족 honestly without overstating (과장 ✗)", () => {
    render(<TimingAccuracyPanel metrics={metrics({ lowSample: true, overall: { total: 2, evaluated: 2, hits: 2, hitRatePct: 100 } })} />);
    expect(screen.getByTestId("timing-accuracy-lowsample")).toBeInTheDocument();
    expect(screen.getByText("표본 부족")).toBeInTheDocument();
    expect(screen.getByText(/신뢰도가 낮습니다/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no directional signals", () => {
    render(<TimingAccuracyPanel metrics={metrics({ overall: { total: 0, evaluated: 0, hits: 0, hitRatePct: null } })} />);
    expect(screen.getByTestId("timing-accuracy-empty")).toBeInTheDocument();
  });
});
