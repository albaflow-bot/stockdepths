/**
 * 발굴 탭 데이터 타입 (서버 GET /api/discover 와 1:1 — SPEC §1-Δ / §3.3-Δ2 결과).
 * 후보 선정은 서버의 결정론적 시장 스캔이 끝냈고, 각 항목은 한 줄 신호로 환원돼 온다.
 */

import type { Direction, ExchangeMarket, SecuritySignal } from "./security";

/** 6 카테고리 키 (SPEC §1-Δ 표). */
export type ScreenCategory =
  | "gainers"
  | "losers"
  | "volume_surge"
  | "unusual_value"
  | "breakout"
  | "oversold_bounce";

/** 발굴 결과 한 종목 (서버 ScreenResultItem). */
export interface DiscoveryItem {
  category: ScreenCategory;
  market: ExchangeMarket;
  code: string;
  name_ko: string | null;
  name_en: string | null;
  last: number | null;
  change_pct: number | null;
  direction: Direction;
  rvol: number | null;
  rsi14: number | null;
  weekly: number[];
  signal: SecuritySignal | null;
  /** 시총 상위 X% 대형주 여부. */
  isLargeCap: boolean;
  /** 이례신호(RVOL≥3/갭±5%) 동반 — "이례신호 있는 초대형주" 배지 조건. */
  unusual: boolean;
}

/** 하루치 발굴 아티팩트. */
export interface DiscoveryArtifact {
  market: "US" | "KR";
  asof: string;
  generatedAt: string;
  provider: string;
  categories: Partial<Record<ScreenCategory, DiscoveryItem[]>>;
  stats: { scanned: number; afterNoiseFilter: number; largeCapsExcluded: number; candidates: number };
}

/** 카테고리 표시 메타 (라벨·설명·대형주 배제 여부). */
export interface CategoryMeta {
  label: string;
  /** 모멘텀 카테고리 = 대형주 완전 배제(UI 명시). unusual_value 만 false. */
  momentum: boolean;
  /** 섹션 부제(선정 기준 한 줄). */
  description: string;
}

/** 노출 순서 + 메타 (SPEC §1-Δ 표). */
export const CATEGORY_ORDER: ScreenCategory[] = [
  "gainers",
  "volume_surge",
  "breakout",
  "unusual_value",
  "oversold_bounce",
  "losers",
];

export const CATEGORY_META: Record<ScreenCategory, CategoryMeta> = {
  gainers: { label: "🚀 급등주", momentum: true, description: "당일 등락률 상위" },
  losers: { label: "🔻 급락주", momentum: true, description: "당일 등락률 하위 · 반등 후보 탐색" },
  volume_surge: { label: "🔥 거래폭발", momentum: true, description: "거래량/20일평균(RVOL) 상위" },
  unusual_value: { label: "💰 대금집중", momentum: false, description: "당일 거래대금 상위" },
  breakout: { label: "📈 신고가/돌파", momentum: true, description: "52주 신고가 경신·박스권 돌파" },
  oversold_bounce: { label: "↩️ 과매도 반등", momentum: true, description: "RSI<30 이탈 후 반등 캔들" },
};

/** 시장별 대형주 배제 상위 N (서버 config 기본값과 일치 — UI 명시용). */
export const LARGE_CAP_TOP_N: Record<DiscoveryArtifact["market"], number> = { US: 50, KR: 30 };
