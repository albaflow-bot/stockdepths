import { describe, it, expect } from "vitest";
import {
  marketDirectionColor,
  marketChangeColor,
  changeArrow,
  directionOf,
} from "../marketColors";
import { tokens } from "../../theme/tokens";

describe("시장별 등락 색상 관례 (SPEC §3.2-Δ 색상 규약)", () => {
  it("KR: 상승=빨강 · 하락=파랑", () => {
    expect(marketDirectionColor("KOSPI", "up")).toBe(tokens.color.negative); // 빨강
    expect(marketDirectionColor("KOSPI", "down")).toBe(tokens.color.marketBlue); // 파랑
    expect(marketDirectionColor("KOSDAQ", "up")).toBe(tokens.color.negative);
    expect(marketDirectionColor("KOSDAQ", "down")).toBe(tokens.color.marketBlue);
  });

  it("US: 상승=초록 · 하락=빨강", () => {
    expect(marketDirectionColor("NASDAQ", "up")).toBe(tokens.color.positive); // 초록
    expect(marketDirectionColor("NASDAQ", "down")).toBe(tokens.color.negative); // 빨강
    expect(marketDirectionColor("NYSE", "up")).toBe(tokens.color.positive);
  });

  it("보합은 muted (시장 무관)", () => {
    expect(marketDirectionColor("KOSPI", "flat")).toBe(tokens.color.textMuted);
    expect(marketDirectionColor("NASDAQ", "flat")).toBe(tokens.color.textMuted);
  });

  it("빨강이 시장 따라 반대 의미 → ▲▼ 병기 필수", () => {
    // KR 상승(빨강)과 US 하락(빨강)이 같은 색 → 기호로 구분되어야 한다.
    expect(marketDirectionColor("KOSPI", "up")).toBe(marketDirectionColor("NASDAQ", "down"));
    expect(changeArrow("up")).toBe("▲");
    expect(changeArrow("down")).toBe("▼");
    expect(changeArrow("flat")).toBe("–");
  });

  it("marketChangeColor + directionOf: 등락률 부호로 색 분기", () => {
    expect(directionOf(1.2)).toBe("up");
    expect(directionOf(-0.3)).toBe("down");
    expect(directionOf(0)).toBe("flat");
    expect(directionOf(null)).toBe("flat");
    expect(marketChangeColor("KOSPI", 1.6)).toBe(tokens.color.negative); // KR 상승 빨강
    expect(marketChangeColor("NASDAQ", -2)).toBe(tokens.color.negative); // US 하락 빨강
  });
});
