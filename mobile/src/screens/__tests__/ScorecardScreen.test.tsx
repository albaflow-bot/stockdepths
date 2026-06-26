import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ScorecardScreen } from "../ScorecardScreen";
import { SAMPLE_SCORECARD } from "../../data/sampleScorecard";
import type { Scorecard } from "../../types/scorecard";

const loader = async () => SAMPLE_SCORECARD;

describe("ScorecardScreen", () => {
  it("shows the benchmark-relative excess headline for the default (1M) period", async () => {
    render(<ScorecardScreen loader={loader} />);
    await waitFor(() => expect(screen.getByTestId("scorecard-hero")).toBeInTheDocument());
    // 1M excess = +1.6%
    expect(screen.getByTestId("hero-excess")).toHaveTextContent("+1.60%");
    expect(screen.getByText("벤치마크 대비 누적 초과수익")).toBeInTheDocument();
    // Infographic pieces, not a plain text list.
    expect(screen.getByTestId("comparison-bars")).toBeInTheDocument();
    expect(screen.getByTestId("win-rate-bar")).toBeInTheDocument();
  });

  it("renders win rate, per-trade average, and MDD", async () => {
    render(<ScorecardScreen loader={loader} />);
    await waitFor(() => expect(screen.getByTestId("scorecard-hero")).toBeInTheDocument());
    expect(screen.getByTestId("win-rate-bar")).toHaveTextContent("66.67%");
    expect(screen.getByTestId("tile-avg")).toHaveTextContent("+3.80%");
    expect(screen.getByTestId("tile-mdd")).toHaveTextContent("-5.20%");
  });

  it("shows realized outcomes alongside the 5Y backtest aggregate", async () => {
    render(<ScorecardScreen loader={loader} />);
    await waitFor(() => expect(screen.getByTestId("realized-vs-backtest")).toBeInTheDocument());
    const panel = screen.getByTestId("realized-vs-backtest");
    expect(panel).toHaveTextContent("실제 성과 vs 5년 백테스트");
    expect(panel).toHaveTextContent("+1.60%"); // realized excess
    expect(panel).toHaveTextContent("+3.20%"); // backtest excess
  });

  it("filters by period (switch to 3M shows that period's metrics, incl. a negative excess)", async () => {
    render(<ScorecardScreen loader={loader} />);
    await waitFor(() => expect(screen.getByTestId("scorecard-hero")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("period-3M"));
    // 3M honestly trailed the benchmark → -2.5%
    await waitFor(() => expect(screen.getByTestId("hero-excess")).toHaveTextContent("-2.50%"));
    expect(screen.getByTestId("win-rate-bar")).toHaveTextContent("53.85%");
  });

  it("shows an empty state for a period with no evaluated recommendations (1W)", async () => {
    render(<ScorecardScreen loader={loader} initialPeriod="1W" />);
    await waitFor(() => expect(screen.getByTestId("scorecard-empty")).toBeInTheDocument());
    expect(screen.queryByTestId("scorecard-hero")).toBeNull();
  });

  it("shows best/worst recommendations", async () => {
    render(<ScorecardScreen loader={loader} />);
    await waitFor(() => expect(screen.getByTestId("best-worst")).toBeInTheDocument());
    const bw = screen.getByTestId("best-worst");
    expect(bw).toHaveTextContent("NVDA");
    expect(bw).toHaveTextContent("TSLA");
  });

  it("shows a friendly error with retry when loading fails", async () => {
    let attempts = 0;
    const failing = async (): Promise<Scorecard> => {
      attempts++;
      if (attempts === 1) throw new Error("성적표 서버가 아직 연결되지 않았습니다.");
      return SAMPLE_SCORECARD;
    };
    render(<ScorecardScreen loader={failing} />);
    await waitFor(() => expect(screen.getByTestId("state-error")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("retry-button"));
    await waitFor(() => expect(screen.getByTestId("scorecard-hero")).toBeInTheDocument());
  });

  it("renders the timing-signal accuracy panel for the selected period (SPEC §5.6)", async () => {
    const timingLoader = async () => ({
      asOf: "2026-06-30",
      horizonDays: 7,
      minSample: 5,
      criterion: "신호일 종가 대비 7일 후 종가 기준 — 매수는 상승, 매도는 하락 시 적중.",
      periods: [
        { period: "1M" as const, periodStart: "2026-05-30", asOf: "2026-06-30", horizonDays: 7,
          buy: { total: 6, evaluated: 6, hits: 4, hitRatePct: 66.67 },
          sell: { total: 4, evaluated: 4, hits: 3, hitRatePct: 75 },
          overall: { total: 10, evaluated: 10, hits: 7, hitRatePct: 70 },
          lowSample: false },
      ],
    });
    render(<ScorecardScreen loader={loader} timingLoader={timingLoader} />);
    await waitFor(() => expect(screen.getByTestId("timing-accuracy")).toBeInTheDocument());
    expect(screen.getByText("타이밍 신호 적중률")).toBeInTheDocument();
    expect(screen.getByTestId("timing-accuracy-buy-rate")).toHaveTextContent("66.67%");
    expect(screen.getByTestId("timing-accuracy-criterion").textContent).toContain("적중 기준");
  });

  it("hides the timing panel gracefully when timing data is unavailable", async () => {
    render(<ScorecardScreen loader={loader} timingLoader={async () => undefined} />);
    await waitFor(() => expect(screen.getByTestId("scorecard-hero")).toBeInTheDocument());
    expect(screen.queryByTestId("timing-accuracy")).toBeNull();
  });
});
