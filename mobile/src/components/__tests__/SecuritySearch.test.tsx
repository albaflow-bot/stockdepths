import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SecuritySearch } from "../SecuritySearch";
import { SecuritySearchCard, formatPrice } from "../SecuritySearchCard";
import type { SecuritySearchItem } from "../../types/security";

function item(over: Partial<SecuritySearchItem> = {}): SecuritySearchItem {
  return {
    market: "KOSPI",
    code: "005930",
    name_ko: "삼성전자",
    name_en: "Samsung Electronics",
    last: 78400,
    change_pct: 1.6,
    direction: "up",
    weekly: [76000, 77000, 78000, 78100, 78200, 78300, 78400],
    signal: { label: "매수 적정", reason: "5일선 회복" },
    ...over,
  };
}

const SAMSUNG = item();
const SDI = item({ code: "006400", name_ko: "삼성SDI", last: 410000, change_pct: -2.1, direction: "down", signal: null });

function type(value: string) {
  fireEvent.change(screen.getByTestId("security-search-input"), { target: { value } });
}

describe("SecuritySearch (검색·추가 화면)", () => {
  it("빈 입력은 안내(idle), 입력하면 결과 카드가 흐른다", async () => {
    const loader = vi.fn(async () => [SAMSUNG, SDI]);
    render(
      <SecuritySearch loader={loader} onAddWatch={() => {}} onAddHolding={() => {}} debounceMs={0} />,
    );
    expect(screen.getByTestId("security-search-idle")).toBeInTheDocument();

    type("삼성");
    await waitFor(() => expect(screen.getByTestId("security-search-results")).toBeInTheDocument());
    expect(screen.getByTestId("search-card-KOSPI-005930")).toBeInTheDocument();
    expect(screen.getByTestId("search-card-KOSPI-006400")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ q: "삼성" }));
  });

  it("결과 없음 → empty 안내", async () => {
    render(<SecuritySearch loader={async () => []} onAddWatch={() => {}} onAddHolding={() => {}} debounceMs={0} />);
    type("없는종목");
    await waitFor(() => expect(screen.getByTestId("security-search-empty")).toBeInTheDocument());
  });

  it("에러 → 메시지 + 다시 시도", async () => {
    render(
      <SecuritySearch
        loader={async () => {
          throw new Error("서버 연결 실패");
        }}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
        debounceMs={0}
      />,
    );
    type("삼성");
    await waitFor(() => expect(screen.getByTestId("security-search-error")).toBeInTheDocument());
    expect(screen.getByText("서버 연결 실패")).toBeInTheDocument();
    expect(screen.getByTestId("security-search-retry")).toBeInTheDocument();
  });

  it("＋관심 / ＋보유 클릭 → 콜백에 해당 종목 전달", async () => {
    const onAddWatch = vi.fn();
    const onAddHolding = vi.fn();
    render(
      <SecuritySearch loader={async () => [SAMSUNG]} onAddWatch={onAddWatch} onAddHolding={onAddHolding} debounceMs={0} />,
    );
    type("삼성");
    await waitFor(() => expect(screen.getByTestId("search-card-KOSPI-005930-watch")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-card-KOSPI-005930-watch"));
    fireEvent.click(screen.getByTestId("search-card-KOSPI-005930-hold"));
    expect(onAddWatch).toHaveBeenCalledWith(expect.objectContaining({ code: "005930" }));
    expect(onAddHolding).toHaveBeenCalledWith(expect.objectContaining({ code: "005930" }));
  });

  it("이미 담긴 종목은 담김 ✓ 표시", async () => {
    render(
      <SecuritySearch
        loader={async () => [SAMSUNG]}
        onAddWatch={() => {}}
        onAddHolding={() => {}}
        watchedCodes={new Set(["005930"])}
        debounceMs={0}
      />,
    );
    type("삼성");
    await waitFor(() => expect(screen.getByText("관심 담김 ✓")).toBeInTheDocument());
  });

  it("등락률 정렬 토글: change desc 로 재정렬", async () => {
    render(<SecuritySearch loader={async () => [SDI, SAMSUNG]} onAddWatch={() => {}} onAddHolding={() => {}} debounceMs={0} />);
    type("삼성");
    await waitFor(() => expect(screen.getByTestId("security-search-results")).toBeInTheDocument());
    // 등락률 토글 선택 → +1.6%(삼성전자)가 -2.1%(SDI)보다 위.
    fireEvent.click(screen.getByTestId("security-search-sort-change"));
    const cards = screen.getAllByTestId(/^search-card-KOSPI-\d+$/);
    expect(cards[0]!.getAttribute("data-testid")).toBe("search-card-KOSPI-005930");
  });
});

describe("SecuritySearchCard 표시", () => {
  it("KR 가격은 원, 등락은 ▲ + 색", () => {
    render(<SecuritySearchCard item={SAMSUNG} watched={false} held={false} onAddWatch={() => {}} onAddHolding={() => {}} />);
    expect(screen.getByText("78,400원")).toBeInTheDocument();
    expect(screen.getByText(/▲ \+1.6% \(오늘\)/)).toBeInTheDocument();
    expect(screen.getByText(/한 줄 신호: 매수 적정/)).toBeInTheDocument();
  });

  it("근거 없는 신호(null)는 렌더하지 않음", () => {
    render(<SecuritySearchCard item={SDI} watched={false} held={false} onAddWatch={() => {}} onAddHolding={() => {}} />);
    expect(screen.queryByTestId("search-card-KOSPI-006400-signal")).not.toBeInTheDocument();
  });

  it("formatPrice: US 는 $, 값 없으면 —", () => {
    expect(formatPrice({ market: "NASDAQ", last: 200.5 })).toBe("$200.50");
    expect(formatPrice({ market: "KOSPI", last: null })).toBe("—");
  });
});
