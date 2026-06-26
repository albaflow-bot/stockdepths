/**
 * SecuritySearchCard 테스트 — 본문 탭(onPress)과 ＋관심/＋보유 버튼이 독립 동작하는지.
 * 버튼 추가 후에도 기존 동작이 무회귀임을 확인(이벤트 전파로 본문 탭이 섞이지 않게).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SecuritySearchCard } from "./SecuritySearchCard";
import type { SecuritySearchItem } from "../types/security";

const ITEM: SecuritySearchItem = {
  market: "NASDAQ",
  code: "AAPL",
  name_ko: "애플",
  name_en: "Apple",
  last: 200,
  change_pct: 1.2,
  direction: "up",
  weekly: [1, 2, 3, 4, 5, 6, 7],
  signal: null,
};

function setup(props: Partial<React.ComponentProps<typeof SecuritySearchCard>> = {}) {
  const onAddWatch = vi.fn();
  const onAddHolding = vi.fn();
  const onPress = vi.fn();
  render(
    <SecuritySearchCard
      item={ITEM}
      watched={false}
      held={false}
      onAddWatch={onAddWatch}
      onAddHolding={onAddHolding}
      onPress={onPress}
      {...props}
    />,
  );
  return { onAddWatch, onAddHolding, onPress };
}

describe("SecuritySearchCard onPress", () => {
  it("본문 탭 시 onPress(item) 호출 (관심/보유 콜백은 미발동)", () => {
    const { onPress, onAddWatch, onAddHolding } = setup();
    fireEvent.click(screen.getByTestId("search-card-NASDAQ-AAPL-body"));
    expect(onPress).toHaveBeenCalledWith(ITEM);
    expect(onAddWatch).not.toHaveBeenCalled();
    expect(onAddHolding).not.toHaveBeenCalled();
  });

  it("＋관심 버튼은 onAddWatch 만, 본문 onPress 는 미발동(무회귀)", () => {
    const { onPress, onAddWatch } = setup();
    fireEvent.click(screen.getByTestId("search-card-NASDAQ-AAPL-watch"));
    expect(onAddWatch).toHaveBeenCalledWith(ITEM);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("onPress 미제공이면 본문은 비탭(에러 없이 렌더)", () => {
    const onAddWatch = vi.fn();
    const onAddHolding = vi.fn();
    render(
      <SecuritySearchCard
        item={ITEM}
        watched={false}
        held={false}
        onAddWatch={onAddWatch}
        onAddHolding={onAddHolding}
      />,
    );
    // 본문 testID 는 onPress 없을 때도 존재하지 않음(Pressable 미렌더) → 버튼만 동작.
    fireEvent.click(screen.getByTestId("search-card-NASDAQ-AAPL-hold"));
    expect(onAddHolding).toHaveBeenCalledWith(ITEM);
  });
});
