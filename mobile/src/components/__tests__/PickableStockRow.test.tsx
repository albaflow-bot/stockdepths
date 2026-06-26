import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PickableStockRow } from "../PickableStockRow";
import { MarketBriefBanner } from "../MarketBriefBanner";
import type { TimingSignal, DailyMarketBrief } from "../../types/timing";

const signal: TimingSignal = {
  ticker: "AMD",
  action: "buy",
  confidence: 0.7,
  oneLineReason: "거래량 급증 + 추세 상단",
  contextNewsIds: [],
  evaluatedAt: "2026-06-24",
  source: "dailyBatch",
};

describe("PickableStockRow (one-tap toggle, SPEC §5.5-4)", () => {
  it("renders symbol, price, change, and a timing badge (한 줄 신호로 환원)", () => {
    render(<PickableStockRow symbol="amd" companyName="에이엠디" price={150} changePercent={6} signal={signal} inWatchlist={false} onToggle={() => {}} />);
    expect(screen.getByText("AMD")).toBeInTheDocument();
    expect(screen.getByText("에이엠디")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getByText("+6.00%")).toBeInTheDocument();
    expect(screen.getByText("매수 적정")).toBeInTheDocument(); // TimingBadge label
  });

  it("shows 담기 + when not in the watchlist and 담김 ✓ when in it", () => {
    const { rerender } = render(<PickableStockRow symbol="AMD" inWatchlist={false} onToggle={() => {}} />);
    expect(screen.getByText("담기 +")).toBeInTheDocument();
    rerender(<PickableStockRow symbol="AMD" inWatchlist onToggle={() => {}} />);
    expect(screen.getByText("담김 ✓")).toBeInTheDocument();
  });

  it("toggles on a single tap of the whole row (no separate remove button)", () => {
    const onToggle = vi.fn();
    render(<PickableStockRow symbol="AMD" inWatchlist={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("pick-row-AMD"));
    expect(onToggle).toHaveBeenCalledWith("AMD");
    // there is no dedicated ✕ remove control on the picker row
    expect(screen.queryByText("✕")).toBeNull();
  });
});

describe("MarketBriefBanner (SPEC §5.5-2)", () => {
  const brief: DailyMarketBrief = {
    market: "KR",
    date: "2026-06-24",
    headlineSummary: "반도체 강세 주도, 코스피 +1.9% 마감",
    sectorSignals: [
      { sector: "반도체", direction: "strong", reason: "외국인 순매수" },
      { sector: "2차전지", direction: "weak", reason: "수요 둔화" },
    ],
    linkedTickers: ["005930"],
    sourceUrls: [],
    generatedAt: "2026-06-24T09:00:00Z",
  };

  it("renders the one-line headline + 강세/약세 섹터 chips", () => {
    render(<MarketBriefBanner brief={brief} />);
    expect(screen.getByText("반도체 강세 주도, 코스피 +1.9% 마감")).toBeInTheDocument();
    expect(screen.getByText("강세 · 반도체")).toBeInTheDocument();
    expect(screen.getByText("약세 · 2차전지")).toBeInTheDocument();
  });

  it("renders nothing when there is no brief", () => {
    const { container } = render(<MarketBriefBanner brief={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
