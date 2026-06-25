import { describe, it, expect } from "vitest";
import { InMemorySecuritySearchStore } from "../searchStore.js";
import { deriveSignal, directionOf } from "../signal.js";
import type {
  DailyScreenRecord,
  SecurityMasterRecord,
  WeeklySeriesRecord,
} from "../types.js";

const master: SecurityMasterRecord[] = [
  { market: "KOSPI", code: "005930", name_ko: "삼성전자", name_en: "Samsung Electronics", is_etf: false, delisted: false },
  { market: "KOSPI", code: "005935", name_ko: "삼성전자우", name_en: "Samsung Electronics Pref", is_etf: false, delisted: false },
  { market: "KOSPI", code: "006400", name_ko: "삼성SDI", name_en: "Samsung SDI", is_etf: false, delisted: false },
  { market: "KOSPI", code: "207940", name_ko: "삼성바이오로직스", name_en: "Samsung Biologics", is_etf: false, delisted: false },
  { market: "KOSPI", code: "000660", name_ko: "SK하이닉스", name_en: "SK Hynix", is_etf: false, delisted: false },
  { market: "NASDAQ", code: "AAPL", name_ko: null, name_en: "Apple Inc", is_etf: false, delisted: false },
  { market: "KOSDAQ", code: "099999", name_ko: "삼성옛것", name_en: "Old Samsung", is_etf: false, delisted: true },
];

const screen: DailyScreenRecord[] = [
  { market: "KOSPI", code: "005930", asof: "2026-06-24", last: 78400, change_pct: 1.6, volume: 1e7, turnover: 9e11, rvol: 1.2, high_52w: 88000, low_52w: 60000, rsi14: 55 },
  { market: "KOSPI", code: "005935", asof: "2026-06-24", last: 64000, change_pct: -0.5, volume: 1e6, turnover: 6e10, rvol: 0.9, high_52w: 70000, low_52w: 50000, rsi14: 48 },
  { market: "KOSPI", code: "006400", asof: "2026-06-24", last: 410000, change_pct: 6.2, volume: 5e6, turnover: 2e11, rvol: 3.4, high_52w: 500000, low_52w: 300000, rsi14: 61 },
  { market: "KOSPI", code: "207940", asof: "2026-06-24", last: 1050000, change_pct: 2.1, volume: 2e5, turnover: 2.1e11, rvol: 1.1, high_52w: 1060000, low_52w: 700000, rsi14: 68 },
  { market: "NASDAQ", code: "AAPL", asof: "2026-06-24", last: 200, change_pct: 0.5, volume: 5e7, turnover: 1e10, rvol: 1.0, high_52w: 230, low_52w: 160, rsi14: 50 },
  // 과거 스냅샷 — 최신(2026-06-24)으로 덮여야 함.
  { market: "KOSPI", code: "005930", asof: "2026-06-20", last: 70000, change_pct: -2.0, volume: 1e7, turnover: 1e11, rvol: 1.0, high_52w: 88000, low_52w: 60000, rsi14: 40 },
];

const weekly: WeeklySeriesRecord[] = [
  { market: "KOSPI", code: "005930", closes: [76000, 76500, 77000, 77800, 78000, 78200, 78400] },
];

function store() {
  return new InMemorySecuritySearchStore({ dir: null, seed: { master, screen, weekly } });
}

describe("종목 검색 (한글/영문 부분일치)", () => {
  it('"삼성" → 삼성전자(005930) 포함 + 부분일치 다건', async () => {
    const res = await store().search({ q: "삼성", market: "ALL", limit: 30 });
    const codes = res.map((r) => r.code);
    expect(codes).toContain("005930");
    // 삼성전자/삼성전자우/삼성SDI/삼성바이오로직스 (상폐 삼성옛것 제외) = 4건.
    expect(res.length).toBe(4);
    expect(codes).not.toContain("099999"); // delisted 제외
    expect(codes).not.toContain("000660"); // 미일치 제외
  });

  it("각 항목에 last/change_pct/direction/weekly/signal 포함", async () => {
    const res = await store().search({ q: "삼성전자", market: "KR", limit: 30 });
    const samsung = res.find((r) => r.code === "005930")!;
    expect(samsung.last).toBe(78400);
    expect(samsung.change_pct).toBe(1.6);
    expect(samsung.direction).toBe("up");
    expect(samsung.weekly).toHaveLength(7);
    expect(samsung.weekly[6]).toBe(78400);
    // signal 은 객체이거나 null (둘 중 하나여야 — 키 누락 금지)
    expect(samsung).toHaveProperty("signal");
  });

  it("최신 daily_screen 스냅샷만 JOIN (과거 asof 무시)", async () => {
    const res = await store().search({ q: "005930", market: "ALL", limit: 30 });
    expect(res[0]!.last).toBe(78400); // 2026-06-24, not 2026-06-20
    expect(res[0]!.direction).toBe("up");
  });

  it("거래대금(turnover) desc 정렬", async () => {
    const res = await store().search({ q: "삼성", market: "ALL", limit: 30 });
    // 삼성전자(9e11) > 삼성바이오(2.1e11) > 삼성SDI(2e11) > 삼성전자우(6e10)
    expect(res.map((r) => r.code)).toEqual(["005930", "207940", "006400", "005935"]);
  });

  it("영문명/코드로도 매칭 (apple → AAPL)", async () => {
    const byName = await store().search({ q: "apple", market: "ALL", limit: 30 });
    expect(byName.map((r) => r.code)).toContain("AAPL");
    const byCode = await store().search({ q: "aapl", market: "US", limit: 30 });
    expect(byCode.map((r) => r.code)).toContain("AAPL");
  });

  it("market 그룹 필터 (KR 은 미국 종목 제외)", async () => {
    const res = await store().search({ q: "a", market: "KR", limit: 30 });
    expect(res.map((r) => r.code)).not.toContain("AAPL");
  });

  it("limit 적용", async () => {
    const res = await store().search({ q: "삼성", market: "ALL", limit: 2 });
    expect(res).toHaveLength(2);
  });

  it("빈 q → 빈 배열", async () => {
    expect(await store().search({ q: "   ", market: "ALL", limit: 30 })).toEqual([]);
  });
});

describe("결정론 signal/direction 도출", () => {
  it("direction 은 change_pct 부호로 결정", () => {
    expect(directionOf(1.2)).toBe("up");
    expect(directionOf(-0.3)).toBe("down");
    expect(directionOf(0)).toBe("flat");
    expect(directionOf(null)).toBe("flat");
  });

  it("RSI<30 + 양봉 → 과매도 반등 주시", () => {
    const sig = deriveSignal({ last: 100, change_pct: 1.0, rvol: 1, rsi14: 25, high_52w: 200 });
    expect(sig?.label).toBe("과매도 반등 주시");
    expect(sig?.reason).toContain("RSI");
  });

  it("RVOL≥3 + 갭+5% → 거래 폭증 급등 (삼성SDI)", () => {
    const sig = deriveSignal({ last: 410000, change_pct: 6.2, rvol: 3.4, rsi14: 61, high_52w: 500000 });
    expect(sig?.label).toBe("거래 폭증 급등");
  });

  it("52주 신고가 근접 → 신고가 돌파 (삼성바이오)", () => {
    const sig = deriveSignal({ last: 1050000, change_pct: 2.1, rvol: 1.1, rsi14: 68, high_52w: 1060000 });
    expect(sig?.label).toBe("신고가 돌파");
  });

  it("명확한 조건 없으면 null (근거 없는 신호 렌더 금지)", () => {
    expect(deriveSignal({ last: 100, change_pct: 0.2, rvol: 1.0, rsi14: 50, high_52w: 200 })).toBeNull();
    expect(deriveSignal(null)).toBeNull();
  });
});
