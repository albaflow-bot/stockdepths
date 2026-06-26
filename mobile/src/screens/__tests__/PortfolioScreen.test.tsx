import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PortfolioScreen } from "../PortfolioScreen";
import { PortfolioRepository } from "../../portfolio/repository";
import { createMemoryStorage } from "../../data/storage";
import type { Quote, QuotesLoader } from "../../data/quotesClient";

function makeRepo() {
  let n = 0;
  return new PortfolioRepository({
    storage: createMemoryStorage(),
    now: () => "2026-06-21T00:00:00Z",
    genId: () => `h${n++}`,
  });
}

const PRICES: Record<string, number> = { AAPL: 120, MSFT: 300, NVDA: 80 };
const loader: QuotesLoader = async (symbols) => {
  const out: Record<string, Quote> = {};
  for (const s of symbols) {
    const p = PRICES[s.toUpperCase()];
    if (p != null) out[s.toUpperCase()] = { symbol: s.toUpperCase(), price: p, changePercent: 1.5 };
  }
  return out;
};

function fill(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe("PortfolioScreen", () => {
  it("shows the local-only privacy note and an empty summary on first load", async () => {
    render(<PortfolioScreen repository={makeRepo()} quotesLoader={loader} />);
    await waitFor(() => expect(screen.getByTestId("portfolio-summary")).toBeInTheDocument());
    expect(screen.getByText(/이 기기에만 저장됩니다/)).toBeInTheDocument();
  });

  it("adds a holding and shows its live return % (deterministic P&L)", async () => {
    render(<PortfolioScreen repository={makeRepo()} quotesLoader={loader} />);
    await waitFor(() => expect(screen.getByTestId("portfolio-summary")).toBeInTheDocument());

    fill("holding-symbol-input", "AAPL");
    fill("holding-cost-input", "100");
    fill("holding-qty-input", "10");
    fireEvent.click(screen.getByTestId("holding-add-button"));

    await waitFor(() => expect(screen.getByTestId("holding-card-AAPL")).toBeInTheDocument());
    expect(screen.getByTestId("holding-return-AAPL")).toHaveTextContent("+20.00%"); // (120-100)/100
    // Portfolio summary reflects +$200 gain.
    expect(screen.getByTestId("summary-gain")).toHaveTextContent("+$200.00");
  });

  it("adds and removes a watchlist symbol", async () => {
    render(<PortfolioScreen repository={makeRepo()} quotesLoader={loader} />);
    await waitFor(() => expect(screen.getByTestId("portfolio-summary")).toBeInTheDocument());

    fill("watch-symbol-input", "MSFT");
    fireEvent.click(screen.getByTestId("watch-add-button"));
    await waitFor(() => expect(screen.getByTestId("watch-row-MSFT")).toBeInTheDocument());
    expect(screen.getByText("$300.00")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("watch-remove-MSFT"));
    await waitFor(() => expect(screen.queryByTestId("watch-row-MSFT")).toBeNull());
  });

  it("still shows holdings (without live P&L) when quotes fail to load", async () => {
    const failing: QuotesLoader = async () => {
      throw new Error("시세 서버가 아직 연결되지 않았습니다.");
    };
    render(<PortfolioScreen repository={makeRepo()} quotesLoader={failing} />);
    await waitFor(() => expect(screen.getByTestId("portfolio-summary")).toBeInTheDocument());

    fill("holding-symbol-input", "AAPL");
    fill("holding-cost-input", "100");
    fireEvent.click(screen.getByTestId("holding-add-button"));

    await waitFor(() => expect(screen.getByTestId("holding-card-AAPL")).toBeInTheDocument());
    expect(screen.getByTestId("quote-warning")).toBeInTheDocument();
    expect(screen.getByText("시세 대기")).toBeInTheDocument(); // no live price → pending, not a crash
  });
});
