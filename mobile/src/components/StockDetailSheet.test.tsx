/**
 * StockDetailSheet 테스트 — 기간 탭 재조회, ＋관심/＋보유 콜백, 로더 에러 graceful.
 * react-native-web 로 렌더(testID → data-testid). 로더는 주입해 결정적.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StockDetailSheet, type StockDetailTarget } from "./StockDetailSheet";
import type { HistoryLoader } from "../data/historyClient";
import type { HistoryResponse } from "../types/history";

const TARGET: StockDetailTarget = {
  symbol: "AAPL",
  market: "US",
  name: "Apple",
  last: 200,
  changePct: 1.23,
  signal: null,
};

function makeResponse(range: HistoryResponse["range"]): HistoryResponse {
  return {
    symbol: "AAPL",
    market: "US",
    range,
    points: [
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 110 },
    ],
    stats: {
      open: 99, high: 115, low: 95, close: 112, volume: 1000,
      prevClose: 100, high52: 200, low52: 80, asOf: "2024-01-02",
    },
  };
}

describe("StockDetailSheet", () => {
  it("열리면 기본 기간(1M)으로 조회하고, 기간 탭 클릭 시 재조회한다", async () => {
    const loader = vi.fn<HistoryLoader>(async ({ range = "1M" }) => makeResponse(range));
    render(
      <StockDetailSheet
        visible
        target={TARGET}
        watched={false}
        held={false}
        onClose={() => {}}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
        loader={loader}
      />,
    );

    await waitFor(() => expect(loader).toHaveBeenCalled());
    expect(loader.mock.calls[0]![0]).toMatchObject({ symbol: "AAPL", market: "US", range: "1M" });

    fireEvent.click(screen.getByTestId("stock-detail-sheet-range-1Y"));
    await waitFor(() =>
      expect(loader.mock.calls.some((c) => c[0].range === "1Y")).toBe(true),
    );
  });

  it("＋관심/＋보유 탭 시 symbol 로 콜백한다", async () => {
    const onAddWatch = vi.fn();
    const onAddHolding = vi.fn();
    render(
      <StockDetailSheet
        visible
        target={TARGET}
        watched={false}
        held={false}
        onClose={() => {}}
        onAddWatch={onAddWatch}
        onAddHolding={onAddHolding}
        loader={async ({ range = "1M" }) => makeResponse(range)}
      />,
    );

    fireEvent.click(screen.getByTestId("stock-detail-sheet-watch"));
    fireEvent.click(screen.getByTestId("stock-detail-sheet-hold"));
    expect(onAddWatch).toHaveBeenCalledWith("AAPL");
    expect(onAddHolding).toHaveBeenCalledWith("AAPL");
  });

  it("로더가 throw 해도 렌더가 깨지지 않고 한 줄 에러를 보여준다", async () => {
    render(
      <StockDetailSheet
        visible
        target={TARGET}
        watched={false}
        held={false}
        onClose={() => {}}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
        loader={async () => {
          throw new Error("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
        }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("stock-detail-sheet-error")).toBeInTheDocument());
    expect(screen.getByTestId("stock-detail-sheet-error").textContent).toContain("네트워크");
  });
});
