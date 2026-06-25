/**
 * 스크리닝 임계값 (SPEC 피드백 라운드 4 §1-Δ 노이즈 필터 + 대형주 배제 + D-1/D-5
 * 제안 default). 결정 대기 큐(specs/decision-queue.md)의 D-1/D-5 가 확정되면 여기서
 * 한 곳만 바꾼다 — 임계값을 코드 곳곳에 흩지 않는다.
 */

import type { ExchangeMarket, MarketGroup } from "./types.js";

export interface ScreenThresholds {
  /** 최소 주가 (동전주 배제). US ≥ $1 / KR ≥ 1,000원. */
  minPrice: number;
  /** 최소 일평균 거래대금 (유령거래 배제). US ≥ $5M / KR ≥ 5억원. */
  minTurnover: number;
  /** 최소 상장 경과일. 60일. */
  minListedDays: number;
  /** 모멘텀 카테고리에서 배제할 시총 상위 종목 수 (D-1). US 50 / KR 30. */
  largeCapTopN: number;
  /** 거래폭발 임계 RVOL (D-5). ≥ 3. */
  rvolSurge: number;
  /** 이례신호 갭 임계(%) — 대형주 unusual_value 예외 허용 기준. ±5%. */
  gapPct: number;
  /** 과매도 임계 RSI (D-5). < 30. */
  rsiOversold: number;
  /** 카테고리별 후보 수 N. */
  perCategory: number;
}

/** US: NASDAQ/NYSE. */
export const US_THRESHOLDS: ScreenThresholds = {
  minPrice: 1,
  minTurnover: 5_000_000,
  minListedDays: 60,
  largeCapTopN: 50,
  rvolSurge: 3,
  gapPct: 5,
  rsiOversold: 30,
  perCategory: 10,
};

/** KR: KOSPI/KOSDAQ. */
export const KR_THRESHOLDS: ScreenThresholds = {
  minPrice: 1_000,
  minTurnover: 500_000_000,
  minListedDays: 60,
  largeCapTopN: 30,
  rvolSurge: 3,
  gapPct: 5,
  rsiOversold: 30,
  perCategory: 10,
};

/** 거래소 마켓 → 임계값 묶음. */
export function thresholdsFor(market: ExchangeMarket | MarketGroup): ScreenThresholds {
  if (market === "KOSPI" || market === "KOSDAQ" || market === "KR") return KR_THRESHOLDS;
  return US_THRESHOLDS;
}
