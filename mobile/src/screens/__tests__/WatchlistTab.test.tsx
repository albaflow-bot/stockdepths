import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WatchlistTab } from "../WatchlistTab";
import { PortfolioRepository } from "../../portfolio/repository";
import { MarketIndexCacheRepository } from "../../data/marketClient";
import { createMemoryStorage } from "../../data/storage";
import type { Quote, QuotesLoader } from "../../data/quotesClient";
import type { DashboardData, DashboardLoader } from "../../data/dashboardClient";
import type { PersonaConfig } from "../../persona/types";

function makeRepo() {
  let n = 0;
  return new PortfolioRepository({
    storage: createMemoryStorage(),
    now: () => "2026-06-21T00:00:00Z",
    genId: () => `h${n++}`,
  });
}

const PRICES: Record<string, number> = { AAPL: 130, AMD: 150 };
const quotesLoader: QuotesLoader = async (symbols) => {
  const out: Record<string, Quote> = {};
  for (const s of symbols) {
    const p = PRICES[s.toUpperCase()];
    if (p != null) out[s.toUpperCase()] = { symbol: s.toUpperCase(), price: p, changePercent: 2, asOf: "2026-06-24" };
  }
  return out;
};

const DASHBOARD: DashboardData = {
  indices: [
    { symbol: "^KS11", name: "코스피", market: "KR", price: 2650, previousClose: 2600, change: 50, changePercent: 1.92, asOf: "2026-06-24", delayed: true, source: "yahoo" },
  ],
  brief: {
    market: "KR",
    date: "2026-06-24",
    headlineSummary: "반도체 강세 주도",
    sectorSignals: [{ sector: "반도체", direction: "strong", reason: "순매수" }],
    linkedTickers: ["AAPL"],
    sourceUrls: [],
    generatedAt: "2026-06-24T09:00:00Z",
  },
  top: [
    { symbol: "AMD", companyName: "AMD", market: "US", price: 150, changePercent: 6, category: "gainers" },
  ],
  signals: {
    AAPL: { ticker: "AAPL", action: "hold", confidence: 0.6, oneLineReason: "박스권 유지", contextNewsIds: [], evaluatedAt: "2026-06-24", source: "dailyBatch" },
    AMD: { ticker: "AMD", action: "buy", confidence: 0.7, oneLineReason: "거래량 급증", contextNewsIds: [], evaluatedAt: "2026-06-24", source: "dailyBatch" },
  },
};

const dashboardLoader: DashboardLoader = async () => DASHBOARD;

const neutral: PersonaConfig = { mode: "preset", profile: "neutral", targetReturnPct: 20, stopLossPct: 10, setAt: "2026-06-01T00:00:00Z" };

function renderTab(extra: Partial<Parameters<typeof WatchlistTab>[0]> = {}) {
  return render(
    <WatchlistTab
      repository={makeRepo()}
      quotesLoader={quotesLoader}
      dashboardLoader={dashboardLoader}
      marketCache={new MarketIndexCacheRepository({ storage: createMemoryStorage() })}
      persona={neutral}
      {...extra}
    />,
  );
}

describe("WatchlistTab — active dashboard", () => {
  it("flows market data on entry: header + brief + 주목 종목 (빈 보유여도 비지 않음)", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId("market-header")).toBeInTheDocument());
    expect(screen.getByText("코스피")).toBeInTheDocument(); // 시장 헤더
    expect(screen.getByText("반도체 강세 주도")).toBeInTheDocument(); // 브리핑
    expect(screen.getByTestId("pick-row-AMD")).toBeInTheDocument(); // 여기서 담기
  });

  it("shows the empty-state nudge toward '여기서 담기' when nothing is held", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId("dashboard-empty")).toBeInTheDocument());
    expect(screen.getByText(/아직 담은 종목이 없어요/)).toBeInTheDocument();
    expect(screen.getByText(/오늘 주목할 종목을 담아보세요/)).toBeInTheDocument();
  });

  it("adds a TOP 종목 to the watchlist with a single tap (toggle)", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId("pick-row-AMD")).toBeInTheDocument());
    expect(screen.getByText("담기 +")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pick-row-AMD"));
    // now appears as a watch card with its DailyBatch timing badge
    await waitFor(() => expect(screen.getByTestId("watch-wrap-AMD")).toBeInTheDocument());
    expect(screen.getByTestId("watch-timing-AMD").textContent).toContain("매수 적정");
  });

  it("renders the fixed timing disclaimer above the badge area", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText("AI 참고 조언 · 투자 책임은 본인")).toBeInTheDocument());
  });

  it("demotes the manual input form behind a '직접 종목 추가' toggle (collapsed by default)", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId("manual-add-toggle")).toBeInTheDocument());
    expect(screen.queryByTestId("manual-add-box")).toBeNull(); // collapsed
    fireEvent.click(screen.getByTestId("manual-add-toggle"));
    expect(screen.getByTestId("manual-add-box")).toBeInTheDocument(); // expands on demand
  });

  it("shows a held position with its OnDeviceRule (personal) + DailyBatch signals, personal on top", async () => {
    const repo = makeRepo();
    // AAPL bought at 100, price 130 → +30% ≥ +20% target → OnDeviceRule = 매도 검토 (sell)
    await repo.addHolding({ symbol: "AAPL", costBasis: 100, quantity: 10 });
    renderTab({ repository: repo });

    await waitFor(() => expect(screen.getByTestId("holding-wrap-AAPL")).toBeInTheDocument());
    const timing = screen.getByTestId("holding-timing-AAPL");
    // both signals present; personal (개인 규칙, 매도 검토) ordered before batch (AI 추천, 보유 유지)
    const personalIdx = timing.textContent!.indexOf("개인 규칙");
    const batchIdx = timing.textContent!.indexOf("AI 추천");
    expect(personalIdx).toBeGreaterThanOrEqual(0);
    expect(batchIdx).toBeGreaterThan(personalIdx);
    expect(timing.textContent).toContain("매도 검토"); // OnDeviceRule sell
    // AAPL is in brief.linkedTickers → 보유 종목 관련 뉴스 배지
    expect(timing.textContent).toContain("내 보유 종목 관련 뉴스 1건");
  });
});
