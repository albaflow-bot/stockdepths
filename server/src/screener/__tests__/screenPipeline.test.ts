import { describe, it, expect } from "vitest";
import type { Candle, HistoricalSeries } from "../../market/types.js";
import {
  computeScreenedSymbol,
  markLargeCaps,
  rsi14,
  type SymbolScanInput,
} from "../screenMetrics.js";
import { applyNoiseFilter, passesNoiseFilter } from "../noiseFilter.js";
import { screenCategories, selectCategory, LARGECAP_GUARDED_CATEGORIES } from "../categories.js";
import { US_THRESHOLDS } from "../config.js";
import { runScreenBatch } from "../screenRunner.js";
import type { ScreenPersistence, ScreenArtifact } from "../screenStore.js";
import type { ExchangeMarket, SecurityMasterRecord } from "../types.js";

/** Build an ascending daily series of `n` candles ending at `lastClose`. */
function series(
  symbol: string,
  opts: { lastClose: number; prevClose?: number; volume?: number; avgVolume?: number; high52w?: number; n?: number },
): HistoricalSeries {
  const n = opts.n ?? 60;
  const candles: Candle[] = [];
  for (let i = 0; i < n - 2; i++) {
    const c = opts.high52w ? opts.high52w * 0.7 : opts.lastClose * 0.8;
    candles.push({ date: `2026-01-${(i % 28) + 1}`, open: c, high: opts.high52w ?? c, low: c, close: c, adjClose: c, volume: opts.avgVolume ?? 1e6 });
  }
  const prev = opts.prevClose ?? opts.lastClose;
  candles.push({ date: "2026-06-23", open: prev, high: prev, low: prev, close: prev, adjClose: prev, volume: opts.avgVolume ?? 1e6 });
  candles.push({ date: "2026-06-24", open: opts.lastClose, high: Math.max(opts.lastClose, opts.high52w ?? 0), low: opts.lastClose, close: opts.lastClose, adjClose: opts.lastClose, volume: opts.volume ?? opts.avgVolume ?? 1e6 });
  return { symbol, market: "US", candles, from: candles[0]!.date, to: "2026-06-24", source: "test" };
}

function master(code: string, name_en: string): SecurityMasterRecord {
  return { market: "NASDAQ" as ExchangeMarket, code, name_ko: null, name_en, is_etf: false, delisted: false };
}

function scan(code: string, opts: Parameters<typeof series>[1] & { shares?: number; listedDays?: number; isManaged?: boolean }): SymbolScanInput {
  return {
    master: master(code, code),
    series: series(code, opts),
    sharesOutstanding: opts.shares,
    listedDays: opts.listedDays,
    isManaged: opts.isManaged,
  };
}

describe("지표 계산 (RSI/RVOL/52주/turnover)", () => {
  it("RSI: 단조 상승 시리즈는 100 에 수렴", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi14(up)).toBe(100);
  });

  it("change_pct / turnover / rvol 결정론 계산", () => {
    const s = computeScreenedSymbol(scan("AAA", { lastClose: 110, prevClose: 100, volume: 3e6, avgVolume: 1e6 }), "2026-06-24");
    expect(s.screen.change_pct).toBe(10); // (110-100)/100
    expect(s.screen.turnover).toBe(110 * 3e6);
    expect(s.screen.rvol).toBeCloseTo(3, 1); // 3e6 / 1e6
  });
});

describe("노이즈 필터 (동전주/유령거래 배제)", () => {
  it("최소 주가 미달(동전주) 탈락", () => {
    const s = computeScreenedSymbol(scan("PENNY", { lastClose: 0.5, volume: 1e7, avgVolume: 1e7 }), "2026-06-24");
    expect(passesNoiseFilter(s, US_THRESHOLDS).reason).toBe("min_price");
  });

  it("최소 거래대금 미달(유령거래) 탈락", () => {
    const s = computeScreenedSymbol(scan("THIN", { lastClose: 10, volume: 100, avgVolume: 100 }), "2026-06-24");
    expect(passesNoiseFilter(s, US_THRESHOLDS).reason).toBe("min_turnover");
  });

  it("상장 60일 미만 탈락 / 정상 종목 통과", () => {
    const fresh = computeScreenedSymbol(scan("NEW", { lastClose: 50, volume: 1e6, avgVolume: 1e6, listedDays: 10 }), "2026-06-24");
    expect(passesNoiseFilter(fresh, US_THRESHOLDS).reason).toBe("min_listed_days");
    const ok = computeScreenedSymbol(scan("GOOD", { lastClose: 50, volume: 1e6, avgVolume: 1e6, listedDays: 200 }), "2026-06-24");
    expect(passesNoiseFilter(ok, US_THRESHOLDS).ok).toBe(true);
  });
});

describe("대형주 배제 (SPEC §3.5-Δ 회귀 게이트)", () => {
  it("시총 상위 N 은 모멘텀 카테고리(gainers/breakout/volume_surge)에 누수 ✗", () => {
    // 대형주: 거대 시총 + 급등 + 거래폭발 + 신고가 → 그래도 모멘텀 카테고리에서 제외돼야.
    const mega = scan("MEGA", { lastClose: 200, prevClose: 180, volume: 1e8, avgVolume: 1e7, high52w: 200, shares: 1e10 });
    const small = scan("SMALL", { lastClose: 50, prevClose: 45, volume: 5e6, avgVolume: 1e6, high52w: 50, shares: 1e6 });
    let screened = [computeScreenedSymbol(mega, "2026-06-24"), computeScreenedSymbol(small, "2026-06-24")];
    const t = { ...US_THRESHOLDS, largeCapTopN: 1 }; // MEGA = 대형주
    screened = applyNoiseFilter(screened, t);
    const marked = markLargeCaps(screened, t.largeCapTopN);
    const byCat = screenCategories(marked, t);
    for (const cat of LARGECAP_GUARDED_CATEGORIES) {
      const codes = byCat[cat].map((c) => c.symbol.master.code);
      expect(codes).not.toContain("MEGA");
    }
    // 대형주는 이례신호(RVOL≥3, 갭+5%)가 있으므로 unusual_value 에는 노출 허용.
    expect(byCat.unusual_value.map((c) => c.symbol.master.code)).toContain("MEGA");
  });

  it("이례신호 없는 대형주는 unusual_value 에도 안 뜸", () => {
    const calmMega = scan("CALM", { lastClose: 200, prevClose: 199.5, volume: 1.05e7, avgVolume: 1e7, shares: 1e10 });
    const t = { ...US_THRESHOLDS, largeCapTopN: 1 };
    const marked = markLargeCaps(applyNoiseFilter([computeScreenedSymbol(calmMega, "2026-06-24")], t), t.largeCapTopN);
    const uv = selectCategory("unusual_value", marked, t);
    expect(uv.map((c) => c.symbol.master.code)).not.toContain("CALM");
  });
});

describe("카테고리 스크리닝", () => {
  it("급등주: 등락률 desc 정렬", () => {
    const t = { ...US_THRESHOLDS, largeCapTopN: 0 };
    const a = computeScreenedSymbol(scan("A", { lastClose: 110, prevClose: 100, volume: 1e6, avgVolume: 1e6 }), "2026-06-24");
    const b = computeScreenedSymbol(scan("B", { lastClose: 130, prevClose: 100, volume: 1e6, avgVolume: 1e6 }), "2026-06-24");
    const marked = markLargeCaps([a, b], 0);
    const g = selectCategory("gainers", marked, t);
    expect(g.map((c) => c.symbol.master.code)).toEqual(["B", "A"]); // +30% 먼저
  });

  it("과매도 반등: RSI<30 + 양봉만", () => {
    // 하락 시리즈 끝에 반등 캔들 → RSI 낮음 + change_pct>0.
    const down = Array.from({ length: 30 }, (_, i) => 100 - i * 2);
    const candles: Candle[] = down.map((c, i) => ({ date: `2026-0${(i % 9) + 1}-01`, open: c, high: c, low: c, close: c, adjClose: c, volume: 1e6 }));
    candles.push({ date: "2026-06-24", open: 44, high: 46, low: 44, close: 46, adjClose: 46, volume: 1e6 }); // 반등
    const s: SymbolScanInput = { master: master("OB", "OB"), series: { symbol: "OB", market: "US", candles, from: candles[0]!.date, to: "2026-06-24", source: "t" }, listedDays: 200 };
    const screened = computeScreenedSymbol(s, "2026-06-24");
    expect(screened.screen.rsi14! < 30).toBe(true);
    const ob = selectCategory("oversold_bounce", [screened], { ...US_THRESHOLDS, largeCapTopN: 0 });
    expect(ob.map((c) => c.symbol.master.code)).toContain("OB");
  });
});

describe("runScreenBatch 엔드투엔드 (LLM oneshot 1회)", () => {
  function recordingPersistence() {
    const saved: { master: number; screen: number; weekly: number; artifact?: ScreenArtifact } = { master: 0, screen: 0, weekly: 0 };
    const p: ScreenPersistence = {
      async saveMaster(r) { saved.master = r.length; },
      async saveDailyScreen(r) { saved.screen = r.length; },
      async saveWeekly(r) { saved.weekly = r.length; },
      async saveArtifact(a) { saved.artifact = a; },
      async getLatestArtifact() { return saved.artifact ?? null; },
      async listMasterCodes() { return []; },
    };
    return { p, saved };
  }

  it("스캔→필터→대형주배제→카테고리→코멘트→저장; 코멘터는 정확히 1회 호출", async () => {
    const { p, saved } = recordingPersistence();
    let commenterCalls = 0;
    const scans: SymbolScanInput[] = [
      scan("BIG", { lastClose: 300, prevClose: 270, volume: 1e8, avgVolume: 1e7, high52w: 300, shares: 1e10, listedDays: 999 }),
      scan("MID", { lastClose: 80, prevClose: 70, volume: 6e6, avgVolume: 1e6, high52w: 80, shares: 1e6, listedDays: 999 }),
      scan("PENNY", { lastClose: 0.4, prevClose: 0.3, volume: 1e7, avgVolume: 1e7, shares: 1e5, listedDays: 999 }), // 동전주 → 탈락
    ];
    const res = await runScreenBatch({
      market: "US",
      asof: "2026-06-24",
      generatedAt: "2026-06-24T21:00:00Z",
      masterSource: async () => scans,
      thresholds: { ...US_THRESHOLDS, largeCapTopN: 1 }, // BIG = 대형주
      persistence: p,
      commenter: async ({ candidates }) => {
        commenterCalls += 1;
        return new Map(candidates.map((c) => [c.key, { label: "매수 적정", reason: "테스트" }]));
      },
    });

    expect(commenterCalls).toBe(1); // oneshot
    expect(saved.master).toBe(3);
    expect(saved.screen).toBe(3); // 전종목 daily_screen 적재 (필터 전)
    expect(saved.weekly).toBe(3);

    const art = res.artifact;
    expect(art.stats.scanned).toBe(3);
    expect(art.stats.afterNoiseFilter).toBe(2); // PENNY 제외
    // BIG 은 모멘텀 카테고리에 없어야 (대형주). MID 는 gainers 에 있어야.
    const gainers = art.categories["gainers"] ?? [];
    expect(gainers.map((i) => i.code)).toEqual(["MID"]);
    expect(gainers.map((i) => i.code)).not.toContain("BIG");
    // 후보에 신호 + 근거 동반.
    const mid = gainers.find((i) => i.code === "MID")!;
    expect(mid.signal).toEqual({ label: "매수 적정", reason: "테스트" });
    expect(mid.direction).toBe("up");
    expect(saved.artifact?.asof).toBe("2026-06-24");
  });

  it("코멘터 미주입 + LLM 제공자 없음 → 결정론 폴백으로도 신호가 채워짐", async () => {
    const { p } = recordingPersistence();
    const scans: SymbolScanInput[] = [
      scan("SURGE", { lastClose: 120, prevClose: 100, volume: 5e6, avgVolume: 1e6, high52w: 120, shares: 1e6, listedDays: 999 }), // +20%, RVOL5, 신고가
    ];
    const res = await runScreenBatch({
      market: "US",
      asof: "2026-06-24",
      generatedAt: "2026-06-24T21:00:00Z",
      masterSource: async () => scans,
      thresholds: { ...US_THRESHOLDS, largeCapTopN: 0 },
      persistence: p,
      commenter: undefined, // 기본 코멘터 → 제공자 없음(테스트 env) → 결정론 폴백
    });
    const all = Object.values(res.artifact.categories).flat();
    const surge = all.find((i) => i.code === "SURGE");
    expect(surge?.signal).not.toBeNull();
    expect(surge?.signal?.reason).toBeTruthy(); // 근거 동반
  });
});
