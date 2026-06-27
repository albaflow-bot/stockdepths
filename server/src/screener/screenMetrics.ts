/**
 * 결정론적 일별 스크린 지표 계산 (SPEC §3.3-Δ 2: "서버 일배치에서 전종목 계산 →
 * daily_screen 적재. 스크리너는 이 테이블의 정렬·필터만 수행 — LLM 호출 0").
 *
 * 입력은 종목별 일봉 시계열(오름차순) + 마스터 메타이고, 출력은 daily_screen 한 행 +
 * 스크리닝에 필요한 파생 플래그(시총·상장경과일·관리/우선주). 순수 함수 — 테스트 용이.
 */

import type { Candle, HistoricalSeries } from "../market/types.js";
import type {
  DailyScreenRecord,
  ExchangeMarket,
  SecurityMasterRecord,
} from "./types.js";

const RSI_PERIOD = 14;
const RVOL_WINDOW = 20; // 20일 평균거래량 (SPEC §3.3-Δ)
const YEAR_TRADING_DAYS = 252;
const KR_MARKETS: ExchangeMarket[] = ["KOSPI", "KOSDAQ"];

/** 파이프라인을 통과하는 작업 단위: daily_screen 한 행 + 스크리닝용 파생 플래그. */
export interface ScreenedSymbol {
  master: SecurityMasterRecord;
  screen: DailyScreenRecord;
  /** 최근 7거래일 종가 (weekly_series·스파크라인). */
  weeklyCloses: number[];
  /** 시가총액(원/달러). 산출 불가 시 null. */
  marketCap: number | null;
  /** 상장 경과일. 알 수 없으면 null. */
  listedDays: number | null;
  /** 관리종목/거래정지 여부. */
  isManaged: boolean;
  /** KR 우선주 여부. */
  isPreferred: boolean;
  /** 시총 상위 X% 대형주 여부 — markLargeCaps() 가 채운다. */
  isLargeCap: boolean;
}

/** 스캔 입력: 마스터 + 일봉 + (있으면) 발행주식수·상장일·관리종목 플래그. */
export interface SymbolScanInput {
  master: SecurityMasterRecord;
  series: HistoricalSeries;
  /** 시총 계산용 발행주식수(선택). */
  sharesOutstanding?: number;
  /** 상장 경과일(선택). */
  listedDays?: number;
  /** 관리종목/거래정지(선택). */
  isManaged?: boolean;
}

function round(v: number | null, digits = 4): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Wilder RSI(14) from closes; null when fewer than period+1 points. */
export function rsi14(closes: number[]): number | null {
  if (closes.length < RSI_PERIOD + 1) return null;
  let gain = 0;
  let loss = 0;
  // Seed with the first `period` deltas.
  for (let i = 1; i <= RSI_PERIOD; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / RSI_PERIOD;
  let avgLoss = loss / RSI_PERIOD;
  // Wilder smoothing over the rest.
  for (let i = RSI_PERIOD + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (RSI_PERIOD - 1) + g) / RSI_PERIOD;
    avgLoss = (avgLoss * (RSI_PERIOD - 1) + l) / RSI_PERIOD;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** RVOL = 당일 거래량 / 직전 20일 평균거래량. null when window unavailable. */
export function rvol(candles: Candle[]): number | null {
  if (candles.length < RVOL_WINDOW + 1) return null;
  const today = candles[candles.length - 1]!;
  let sum = 0;
  for (let i = candles.length - 1 - RVOL_WINDOW; i < candles.length - 1; i++) {
    sum += candles[i]!.volume;
  }
  const avg = sum / RVOL_WINDOW;
  if (avg <= 0) return null;
  return today.volume / avg;
}

/** KR 우선주 추정: 우선주 코드는 끝자리가 0 이 아니거나 종목명이 '우' 로 끝남. */
export function isPreferredStock(market: ExchangeMarket, code: string, nameKo: string | null): boolean {
  if (!KR_MARKETS.includes(market)) return false;
  if (nameKo && /우[A-Z]?$/.test(nameKo.trim())) return true;
  return code.length === 6 && !code.endsWith("0");
}

/**
 * 한 종목의 일봉 시계열에서 daily_screen 한 행 + 파생 플래그를 계산한다.
 * 거래대금(turnover)은 무료 일봉에서 일내 합산이 없으므로 종가×거래량으로 근사한다
 * (결정론·일관 — SPEC "단순 거래량 ✗, 대금 기준" 충족용 일별 프록시).
 */
export function computeScreenedSymbol(input: SymbolScanInput, asof: string): ScreenedSymbol {
  const { master, series } = input;
  const candles = series.candles;
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const lastClose = last ? last.close : 0;
  const changePct = last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;

  const window = candles.slice(-YEAR_TRADING_DAYS);
  const high52w = window.length ? Math.max(...window.map((c) => c.high)) : null;
  const low52w = window.length ? Math.min(...window.map((c) => c.low)) : null;
  const volume = last ? last.volume : 0;
  const turnover = last ? last.close * last.volume : 0;

  const marketCap =
    input.sharesOutstanding != null && input.sharesOutstanding > 0
      ? input.sharesOutstanding * lastClose
      : null;

  const screen: DailyScreenRecord = {
    market: master.market,
    code: master.code,
    asof,
    last: round(lastClose),
    change_pct: round(changePct, 2),
    volume: round(volume, 2),
    turnover: round(turnover, 2),
    rvol: round(rvol(candles), 2),
    high_52w: round(high52w),
    low_52w: round(low52w),
    rsi14: round(rsi14(closes), 2),
    market_cap: marketCap,
  };

  return {
    master,
    screen,
    weeklyCloses: closes.slice(-7).map((c) => round(c) ?? 0),
    marketCap,
    listedDays: input.listedDays ?? null,
    isManaged: input.isManaged ?? false,
    isPreferred: isPreferredStock(master.market, master.code, master.name_ko),
    isLargeCap: false,
  };
}

/**
 * 시총 상위 topN 종목에 isLargeCap=true 표시 (SPEC §1-Δ 대형주 배제 규칙).
 * 시총을 알 수 없는 종목(marketCap null)은 대형주로 단정하지 않는다(맨 뒤로 정렬).
 * 입력 배열을 변형하지 않고 새 플래그가 반영된 배열을 반환한다.
 */
export function markLargeCaps(symbols: ScreenedSymbol[], topN: number): ScreenedSymbol[] {
  const ranked = symbols
    .filter((s) => s.marketCap != null)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  const largeCapKeys = new Set(ranked.slice(0, Math.max(0, topN)).map((s) => `${s.master.market}:${s.master.code}`));
  return symbols.map((s) => ({
    ...s,
    isLargeCap: largeCapKeys.has(`${s.master.market}:${s.master.code}`),
  }));
}
