import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TimingBadge,
  TimingSignalArea,
  TIMING_DISCLAIMER,
  TIMING_BADGE_TONE,
  hasReason,
} from "../TimingBadge";
import type { TimingSignal } from "../../types/timing";

function sig(over: Partial<TimingSignal> = {}): TimingSignal {
  return {
    ticker: "AAPL",
    action: "buy",
    confidence: 0.8,
    oneLineReason: "5년 추세 상단 + 최근 거래량 급증",
    contextNewsIds: [],
    evaluatedAt: "2026-06-24",
    source: "dailyBatch",
    ...over,
  };
}

describe("label + tone mapping (SPEC §5.4)", () => {
  it("maps each action to its Korean label", () => {
    expect(render(<TimingBadge signal={sig({ action: "buy" })} />).getByText("매수 적정")).toBeTruthy();
    render(<TimingBadge signal={sig({ action: "sell" })} />);
    expect(screen.getByText("매도 검토")).toBeInTheDocument();
    render(<TimingBadge signal={sig({ action: "hold" })} />);
    expect(screen.getByText("보유 유지")).toBeInTheDocument();
    render(<TimingBadge signal={sig({ action: "watch" })} />);
    expect(screen.getByText("관망")).toBeInTheDocument();
  });

  it("ties tone to the semantic palette, never the identity color", () => {
    expect(TIMING_BADGE_TONE).toEqual({ buy: "positive", sell: "negative", hold: "neutral", watch: "muted" });
  });
});

describe("one-line reason guard (근거 없는 신호 ✗)", () => {
  it("always renders the reason alongside the badge", () => {
    render(<TimingBadge signal={sig()} />);
    expect(screen.getByText("5년 추세 상단 + 최근 거래량 급증")).toBeInTheDocument();
  });
  it("renders nothing when the signal has no reason", () => {
    const { container } = render(<TimingBadge signal={sig({ oneLineReason: "  " })} />);
    expect(container.firstChild).toBeNull();
    expect(hasReason(sig({ oneLineReason: "" }))).toBe(false);
  });
});

describe("expansion: 2-axis chart + related news", () => {
  it("expands to show the 장기×최근 2-axis chart on tap", () => {
    render(<TimingBadge signal={sig()} axes={{ longTermPct: 42, recentPct: -3 }} />);
    expect(screen.queryByTestId("timing-two-axis")).toBeNull();
    fireEvent.click(screen.getByTestId("timing-badge-AAPL-dailyBatch-toggle"));
    expect(screen.getByTestId("timing-two-axis")).toBeInTheDocument();
    expect(screen.getByText("장기(5년)")).toBeInTheDocument();
    expect(screen.getByText("최근 흐름")).toBeInTheDocument();
    expect(screen.getByText("+42.00%")).toBeInTheDocument();
  });

  it("shows related news only for the signal's contextNewsIds", () => {
    const signal = sig({ contextNewsIds: ["n1"] });
    render(
      <TimingBadge
        signal={signal}
        defaultExpanded
        relatedNews={[
          { id: "n1", title: "Apple 신제품 호재", url: "https://x/1" },
          { id: "n2", title: "관련 없음", url: "https://x/2" },
        ]}
      />,
    );
    expect(screen.getByText("• Apple 신제품 호재")).toBeInTheDocument();
    expect(screen.queryByText("• 관련 없음")).toBeNull();
  });

  it("is not expandable when there is neither axes nor news", () => {
    render(<TimingBadge signal={sig()} />);
    // no toggle affordance content (chevron) and tapping does nothing
    expect(screen.queryByText("▼")).toBeNull();
  });
});

describe("TimingSignalArea", () => {
  const personal = sig({ source: "onDeviceRule", action: "sell", oneLineReason: "손절선 도달 — 매도 검토" });
  const batch = sig({ source: "dailyBatch", action: "hold", oneLineReason: "박스권 유지" });

  it("fixes the disclaimer at the top of the badge area", () => {
    render(<TimingSignalArea batch={batch} />);
    expect(screen.getByText(TIMING_DISCLAIMER)).toBeInTheDocument();
  });

  it("orders the personal rule on top of the batch signal (conflict)", () => {
    render(<TimingSignalArea personal={personal} batch={batch} />);
    const first = screen.getByTestId("timing-area-badge-0");
    const second = screen.getByTestId("timing-area-badge-1");
    // personal (onDeviceRule) first, batch second
    expect(first.textContent).toContain("개인 규칙");
    expect(first.textContent).toContain("매도 검토");
    expect(second.textContent).toContain("AI 추천");
    expect(second.textContent).toContain("보유 유지");
  });

  it("renders a single signal when only one source is present", () => {
    render(<TimingSignalArea batch={batch} />);
    expect(screen.getByTestId("timing-area-badge-0")).toBeInTheDocument();
    expect(screen.queryByTestId("timing-area-badge-1")).toBeNull();
  });

  it("shows the '내 보유 종목 관련 뉴스 N건' badge when holdingNewsCount > 0", () => {
    render(<TimingSignalArea batch={batch} holdingNewsCount={2} />);
    expect(screen.getByText("📄 내 보유 종목 관련 뉴스 2건")).toBeInTheDocument();
  });

  it("drops a reason-less signal but keeps the valid one", () => {
    render(<TimingSignalArea personal={sig({ source: "onDeviceRule", oneLineReason: "" })} batch={batch} />);
    const first = screen.getByTestId("timing-area-badge-0");
    expect(first.textContent).toContain("AI 추천"); // batch survived; personal dropped
    expect(screen.queryByTestId("timing-area-badge-1")).toBeNull();
  });
});
