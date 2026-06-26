import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PickCard } from "../PickCard";
import { DisclaimerBanner, DISCLAIMER_HEADLINE } from "../DisclaimerBanner";
import { BacktestPanel } from "../BacktestPanel";
import { SAMPLE_ARTIFACT } from "../../data/sampleArtifact";
import type { Pick } from "../../types/picks";

const nvda = SAMPLE_ARTIFACT.picks.find((p) => p.symbol === "NVDA")!;
const aapl = SAMPLE_ARTIFACT.picks.find((p) => p.symbol === "AAPL")!; // no backtest

describe("PickCard", () => {
  it("renders symbol, rationale, and confidence/risk badges", () => {
    render(<PickCard pick={nvda} />);
    expect(screen.getByText("NVDA")).toBeInTheDocument();
    expect(screen.getByText(nvda.rationale)).toBeInTheDocument();
    expect(screen.getByText("신뢰도 높음")).toBeInTheDocument();
    expect(screen.getByText("리스크 높음")).toBeInTheDocument();
  });

  it("hides the backtest panel until the toggle is pressed, then shows it", () => {
    render(<PickCard pick={nvda} />);
    expect(screen.queryByTestId("backtest-panel-NVDA")).toBeNull();

    fireEvent.click(screen.getByTestId("backtest-toggle-NVDA"));
    expect(screen.getByTestId("backtest-panel-NVDA")).toBeInTheDocument();
    // Headline excess return is shown (52.5% excess for NVDA).
    expect(screen.getByText("벤치마크 대비 초과수익")).toBeInTheDocument();
    expect(screen.getByText("+52.50%")).toBeInTheDocument();

    // Toggling again collapses it.
    fireEvent.click(screen.getByTestId("backtest-toggle-NVDA"));
    expect(screen.queryByTestId("backtest-panel-NVDA")).toBeNull();
  });

  it("renders the action note when present", () => {
    render(<PickCard pick={nvda} />);
    expect(screen.getByText(`→ ${nvda.action}`)).toBeInTheDocument();
  });

  it("can start expanded (defaultExpanded)", () => {
    render(<PickCard pick={nvda} defaultExpanded />);
    expect(screen.getByTestId("backtest-panel-NVDA")).toBeInTheDocument();
  });

  it("shows a persona-match badge only when personaMatch is provided", () => {
    const { rerender } = render(<PickCard pick={nvda} />);
    expect(screen.queryByTestId("persona-match-NVDA")).toBeNull(); // no persona context

    rerender(<PickCard pick={nvda} personaMatch />);
    expect(screen.getByText("성향 적합")).toBeInTheDocument();

    rerender(<PickCard pick={nvda} personaMatch={false} />);
    expect(screen.getByText("성향 주의")).toBeInTheDocument();
  });
});

describe("BacktestPanel", () => {
  it("shows the honest empty state when a pick has no backtest", () => {
    render(<PickCard pick={aapl} defaultExpanded />);
    expect(screen.getByText("5년 백테스트 결과가 아직 없습니다.")).toBeInTheDocument();
  });

  it("formats negative excess (underperformance) honestly", () => {
    const losing: Pick = SAMPLE_ARTIFACT.picks.find((p) => p.symbol === "MSFT")!;
    render(<BacktestPanel backtest={losing.backtest} />);
    expect(screen.getByText("-28.60%")).toBeInTheDocument(); // MSFT trailed SPY
  });
});

describe("DisclaimerBanner", () => {
  it("renders the exact required disclaimer headline", () => {
    render(<DisclaimerBanner />);
    expect(screen.getByText(new RegExp(DISCLAIMER_HEADLINE))).toBeInTheDocument();
    expect(DISCLAIMER_HEADLINE).toBe("AI는 보장이 아닌 참고 조언입니다.");
  });
  it("shows the detail line when it differs from the headline", () => {
    render(<DisclaimerBanner detail="투자 판단과 책임은 본인에게 있습니다." />);
    expect(screen.getByText("투자 판단과 책임은 본인에게 있습니다.")).toBeInTheDocument();
  });
});
