/**
 * Client-side mirror of the server's timing-signal contract (server Task 1).
 *
 * Kept as a thin local copy so the mobile package stays decoupled from the server
 * package's build. Shapes must match server `TimingSignal` / `DailyMarketBrief` /
 * `SectorSignal` on the wire (SPEC 피드백 라운드 3 §5.3–§5.4).
 *
 * This is the data foundation of the product's MAIN feature — 매수/매도 타이밍.
 * Every stock surface (오늘의 추천, TOP 종목, 관심·보유 탭) renders a TimingSignal
 * badge; the 관심·보유 탭 시장 브리핑 row renders the DailyMarketBrief.
 */

/** 매수 / 매도 / 보유유지 / 관망 (SPEC §5.4). */
export type TimingAction = "buy" | "sell" | "hold" | "watch";

/**
 * Who produced the signal (SPEC §5.4).
 * - `dailyBatch`: 서버 하루 1회, 공용 (LLM 방향성).
 * - `onDeviceRule`: 단말 실시간, 개인 (목표가/손절선 도달, LLM 0).
 */
export type SignalSource = "dailyBatch" | "onDeviceRule";

/** A single timing badge attached to a ticker (SPEC §5.4). */
export interface TimingSignal {
  ticker: string;
  action: TimingAction;
  /** 0.0~1.0 — feeds the 성적표 적중률. */
  confidence: number;
  /** 비전문가용 한 줄 근거. 근거 없는 신호 ✗. */
  oneLineReason: string;
  /** Linked NewsItem ids (SPEC §5.3 linkedTickers); empty when none. */
  contextNewsIds: string[];
  /** UTC ISO 8601 timestamp the signal was evaluated. */
  evaluatedAt: string;
  source: SignalSource;
}

/** 강세/약세 섹터 한 줄 근거 (SPEC §5.3 sector_signals). */
export interface SectorSignal {
  sector: string;
  direction: "strong" | "weak";
  reason: string;
}

/** The daily market brief — one per market+date (SPEC §5.3). */
export interface DailyMarketBrief {
  market: string;
  date: string;
  /** 오늘 시장 한 줄. */
  headlineSummary: string;
  /** 강세/약세 섹터 2~3개 + 한 줄 근거. */
  sectorSignals: SectorSignal[];
  /** 요약 안에서 언급된 종목 — 보유/관심 교집합 시 뉴스 배지. */
  linkedTickers: string[];
  /** 출처 URL 박제 — 검증 가능성. */
  sourceUrls: string[];
  /** UTC ISO 8601 timestamp the brief was generated. */
  generatedAt: string;
}

/** UI label + tone for a TimingAction badge (한글 텍스트 우선, 모호 아이콘 ✗ — SPEC §5.4). */
export const TIMING_ACTION_LABELS: Record<TimingAction, string> = {
  buy: "매수 적정",
  sell: "매도 검토",
  hold: "보유 유지",
  watch: "관망",
};

/**
 * Badge tone, separate from identity/flavor color (SPEC §5.4: 색 테마는 identity
 * 색과 분리). Maps to the design tokens' semantic colors at the call site.
 */
export type TimingTone = "up" | "down" | "neutral";

export const TIMING_ACTION_TONES: Record<TimingAction, TimingTone> = {
  buy: "up",
  sell: "down",
  hold: "neutral",
  watch: "neutral",
};
