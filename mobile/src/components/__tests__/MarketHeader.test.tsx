import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MarketHeader,
  selectIndices,
  indexChangeColor,
} from "../MarketHeader";
import { tokens } from "../../theme/tokens";
import type { MarketIndex } from "../../types/market";

function idx(over: Partial<MarketIndex> = {}): MarketIndex {
  return {
    symbol: "^KS11",
    name: "코스피",
    market: "KR",
    price: 2650.3,
    previousClose: 2600,
    change: 50.3,
    changePercent: 1.93,
    asOf: "2026-06-24",
    delayed: true,
    source: "yahoo",
    ...over,
  };
}

const KOSPI = idx();
const KOSDAQ = idx({ symbol: "^KQ11", name: "코스닥", price: 860.1, change: -3.2, changePercent: -0.37 });
const SP500 = idx({ symbol: "^GSPC", name: "S&P 500", market: "US", price: 5400, change: 0, changePercent: 0 });
const NASDAQ = idx({ symbol: "^IXIC", name: "나스닥", market: "US", price: 17500, change: 120, changePercent: 0.69 });

describe("indexChangeColor (identity-separated semantic palette)", () => {
  it("is green for up, red for down, muted for flat — never the identity color", () => {
    expect(indexChangeColor(1.2)).toBe(tokens.color.positive);
    expect(indexChangeColor(-0.4)).toBe(tokens.color.negative);
    expect(indexChangeColor(0)).toBe(tokens.color.textMuted);
    expect(indexChangeColor(1.2)).not.toBe(tokens.color.primary);
  });
});

describe("selectIndices (props-configurable 표시 종목)", () => {
  const all = [KOSPI, KOSDAQ, SP500, NASDAQ];
  it("returns all when no symbol list is given", () => {
    expect(selectIndices(all)).toHaveLength(4);
  });
  it("orders + filters by the requested symbols (KR-only bar)", () => {
    expect(selectIndices(all, ["^KQ11", "^KS11"]).map((i) => i.symbol)).toEqual(["^KQ11", "^KS11"]);
  });
  it("drops requested symbols that aren't present", () => {
    expect(selectIndices(all, ["^KS11", "^MISSING"]).map((i) => i.symbol)).toEqual(["^KS11"]);
  });
});

describe("MarketHeader", () => {
  it("renders configured KR + US indices with 전일대비·등락률", () => {
    render(<MarketHeader indices={[KOSPI, KOSDAQ, NASDAQ, SP500]} />);
    expect(screen.getByText("코스피")).toBeInTheDocument();
    expect(screen.getByText("코스닥")).toBeInTheDocument();
    expect(screen.getByText("나스닥")).toBeInTheDocument();
    expect(screen.getByText("S&P 500")).toBeInTheDocument();
    // KOSPI change paired absolute + percent
    expect(screen.getByText("+50.30 (+1.93%)")).toBeInTheDocument();
    // KOSDAQ negative
    expect(screen.getByText("-3.20 (-0.37%)")).toBeInTheDocument();
  });

  it("filters/orders display by the symbols prop (reuse for KR-only vs US-only)", () => {
    render(<MarketHeader indices={[KOSPI, KOSDAQ, NASDAQ, SP500]} symbols={["^IXIC", "^GSPC"]} />);
    expect(screen.getByText("나스닥")).toBeInTheDocument();
    expect(screen.getByText("S&P 500")).toBeInTheDocument();
    expect(screen.queryByText("코스피")).toBeNull();
  });

  it("shows the 기준일 + 지연 meta from the freshest row", () => {
    render(<MarketHeader indices={[KOSPI]} testID="mh" />);
    expect(screen.getByTestId("mh-asof").textContent).toBe("기준 6/24 · 지연");
  });

  it("renders the cached value with a 갱신 중 indicator while refreshing (no bare spinner)", () => {
    render(<MarketHeader indices={[KOSPI]} updating testID="mh" />);
    expect(screen.getByText("코스피")).toBeInTheDocument(); // previous value still shown
    expect(screen.getByTestId("mh-updating")).toBeInTheDocument();
  });

  it("shows a quiet placeholder (never blank) when there is no cached value yet", () => {
    render(<MarketHeader indices={[]} updating testID="mh" />);
    expect(screen.getByTestId("mh-placeholder").textContent).toContain("불러오는 중");
  });

  it("flags a stale cache after a failed refresh", () => {
    render(<MarketHeader indices={[KOSPI]} stale testID="mh" />);
    expect(screen.getByTestId("mh-stale")).toBeInTheDocument();
  });
});
