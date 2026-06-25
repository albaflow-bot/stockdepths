/**
 * 발굴 일배치 파이프라인 (SPEC §3.3-Δ2 — 매일 장마감 후 1회).
 *
 *  1. 마스터 갱신       → security_master upsert
 *  2. 시세 인제스트     → 전종목 일봉에서 daily_screen(등락률/RVOL/RSI/52주/대금) 계산·적재
 *  3. 노이즈 필터       → 동전주·유령거래·신규상장·관리/우선주 제외
 *  4. 대형주 배제       → 시총 상위 X% 를 모멘텀 카테고리에서 drop (이례신호는 unusual_value 만)
 *  5. 카테고리 스크리닝 → 6 카테고리 정렬·임계값으로 후보 N개 (여기까지 LLM 0회)
 *  6. LLM oneshot       → 후보 풀 전체에 "왜 지금·무엇을" 한 줄 신호 1회 부여
 *  7. 불변 스냅샷 저장   → daily_screen(append-only) + 카테고리 후보 아티팩트
 *
 * 핵심: 후보 *선정* = 결정론적 시장 스캔(엣지), LLM = 한 줄 코멘트(상용품). 데이터
 * 소스(마스터/시세)는 주입식 — 무료 거래소 마스터/지연시세 또는 크롤러를 갈아끼운다.
 */

import { directionOf } from "./signal.js";
import { thresholdsFor, type ScreenThresholds } from "./config.js";
import {
  computeScreenedSymbol,
  markLargeCaps,
  type ScreenedSymbol,
  type SymbolScanInput,
} from "./screenMetrics.js";
import { applyNoiseFilter, type NoiseFilterOptions } from "./noiseFilter.js";
import {
  screenCategories,
  hasUnusualSignal,
  type ScreenCandidate,
  type ScreenCategory,
} from "./categories.js";
import { makeScreenCommenter, type CommentCandidate, type ScreenCommenter } from "./commenter.js";
import {
  type ScreenArtifact,
  type ScreenPersistence,
  type ScreenResultItem,
} from "./screenStore.js";
import type { DailyScreenRecord, MarketGroup, WeeklySeriesRecord } from "./types.js";

export interface RunScreenOptions {
  /** 'US' | 'KR' — 이 배치가 도는 시장 그룹. */
  market: MarketGroup;
  /** 기준일 YYYY-MM-DD (라이브러리에 시계 없음 — 주입). */
  asof: string;
  /** 아티팩트에 박을 ISO 생성시각 (주입). */
  generatedAt: string;
  /**
   * step 1: 전종목 마스터 소스 (거래소 공개 마스터/크롤러) — 종목별 일봉을 받아 지표 계산.
   * {@link screenedSource} 를 주면 생략된다(둘 중 하나 필수).
   */
  masterSource?: () => Promise<SymbolScanInput[]>;
  /**
   * 대안: 이미 적재된 daily_screen 스냅샷을 ScreenedSymbol 로 직접 공급(candle 재수집 0).
   * 주어지면 step 1·2(마스터 인제스트·지표 계산·daily_screen/weekly 재저장)를 건너뛴다
   * (스냅샷은 ingest 배치가 이미 적재). {@link makeSnapshotScanSource} 참고.
   */
  screenedSource?: () => Promise<ScreenedSymbol[]>;
  /** step 6: 후보 코멘터. 기본은 제공자 체인 + 결정론 폴백. */
  commenter?: ScreenCommenter;
  /** 영속화 (daily_screen/weekly/master/artifact). */
  persistence: ScreenPersistence;
  /** 임계값 override. 기본은 market 별 default. */
  thresholds?: ScreenThresholds;
  /** 활성 카테고리. 기본 6개 전부 (D-2: MVP 는 3개로 좁힐 수 있음). */
  categories?: ScreenCategory[];
  /** 노이즈 필터 옵션(관리종목 포함 토글 등). */
  noiseOptions?: NoiseFilterOptions;
}

export interface RunScreenResult {
  artifact: ScreenArtifact;
}

/** ScreenedSymbol → 카테고리 항목 (검색/UI 공용 형태 + 신호). */
function toResultItem(
  c: ScreenCandidate,
  signal: ScreenResultItem["signal"],
  t: ScreenThresholds,
): ScreenResultItem {
  const { master, screen, weeklyCloses, isLargeCap } = c.symbol;
  return {
    category: c.category,
    market: master.market,
    code: master.code,
    name_ko: master.name_ko,
    name_en: master.name_en,
    last: screen.last,
    change_pct: screen.change_pct,
    direction: directionOf(screen.change_pct),
    rvol: screen.rvol,
    rsi14: screen.rsi14,
    weekly: weeklyCloses,
    signal,
    isLargeCap,
    unusual: isLargeCap && hasUnusualSignal(c.symbol, t),
  };
}

function toCommentCandidate(s: ScreenedSymbol, category: ScreenCategory): CommentCandidate {
  const { master, screen } = s;
  return {
    key: `${master.market}:${master.code}`,
    market: master.market,
    code: master.code,
    name: master.name_ko ?? master.name_en ?? master.code,
    category,
    last: screen.last,
    change_pct: screen.change_pct,
    rvol: screen.rvol,
    rsi14: screen.rsi14,
    high_52w: screen.high_52w,
  };
}

/**
 * 파이프라인 1회 실행. 데이터 소스·코멘터·영속화는 모두 주입식이라 테스트가 결정론적.
 */
export async function runScreenBatch(opts: RunScreenOptions): Promise<RunScreenResult> {
  const t = opts.thresholds ?? thresholdsFor(opts.market);
  const commenter = opts.commenter ?? makeScreenCommenter();

  // 1·2. 데이터 소스: 스냅샷 경로(이미 적재된 daily_screen 직접 공급) 또는 candle 경로
  // (종목별 일봉 재수집 → 지표 계산 → daily_screen/weekly 재저장).
  let screened: ScreenedSymbol[];
  let scannedCount: number;
  if (opts.screenedSource) {
    screened = await opts.screenedSource();
    scannedCount = screened.length;
    // 스냅샷은 ingest 배치가 이미 master/daily_screen/weekly 에 적재함 — 재저장 생략.
  } else if (opts.masterSource) {
    const scans = await opts.masterSource();
    await opts.persistence.saveMaster(scans.map((s) => s.master));
    screened = scans.map((s) => computeScreenedSymbol(s, opts.asof));
    const screenRows: DailyScreenRecord[] = screened.map((s) => s.screen);
    const weeklyRows: WeeklySeriesRecord[] = screened.map((s) => ({
      market: s.master.market,
      code: s.master.code,
      closes: s.weeklyCloses,
    }));
    await opts.persistence.saveDailyScreen(screenRows);
    await opts.persistence.saveWeekly(weeklyRows);
    scannedCount = scans.length;
  } else {
    throw new Error("runScreenBatch: masterSource 또는 screenedSource 중 하나는 필수입니다.");
  }

  // 3. 노이즈 필터.
  const filtered = applyNoiseFilter(screened, t, opts.noiseOptions);

  // 4. 대형주 표시 (모멘텀 카테고리 배제는 카테고리 선별에서 강제).
  const marked = markLargeCaps(filtered, t.largeCapTopN);
  const largeCapsExcluded = marked.filter((s) => s.isLargeCap).length;

  // 5. 카테고리 스크리닝 (LLM 0회).
  const byCategory = screenCategories(marked, t, opts.categories);

  // 후보 풀 dedup (한 종목이 여러 카테고리에 들 수 있음 — 첫 카테고리로 코멘트).
  const poolByKey = new Map<string, { candidate: ScreenCandidate }>();
  for (const cands of Object.values(byCategory)) {
    for (const c of cands) {
      const key = `${c.symbol.master.market}:${c.symbol.master.code}`;
      if (!poolByKey.has(key)) poolByKey.set(key, { candidate: c });
    }
  }

  // 6. LLM oneshot — 후보 풀에 한 줄 신호 1회 부여.
  const commentCandidates: CommentCandidate[] = [...poolByKey.values()].map((p) =>
    toCommentCandidate(p.candidate.symbol, p.candidate.category),
  );
  const signals = await commenter({ asOfDate: opts.asof, candidates: commentCandidates });

  // 7. 결과 조립 + 불변 스냅샷 저장.
  const categories: Record<string, ScreenResultItem[]> = {};
  for (const [cat, cands] of Object.entries(byCategory)) {
    categories[cat] = cands.map((c) =>
      toResultItem(c, signals.get(`${c.symbol.master.market}:${c.symbol.master.code}`) ?? null, t),
    );
  }

  let provider = "deterministic";
  if (signals.size > 0 && commentCandidates.length > 0) {
    // 결정론 폴백만으로도 신호가 차므로 provider 는 '있으면 llm, 없으면 deterministic'.
    provider = opts.commenter ? "custom" : "llm-or-deterministic";
  }

  const artifact: ScreenArtifact = {
    market: opts.market,
    asof: opts.asof,
    generatedAt: opts.generatedAt,
    provider,
    categories,
    stats: {
      scanned: scannedCount,
      afterNoiseFilter: filtered.length,
      largeCapsExcluded,
      candidates: poolByKey.size,
    },
  };
  await opts.persistence.saveArtifact(artifact);

  return { artifact };
}
