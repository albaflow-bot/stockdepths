/**
 * Engineering Edge Gate — domain model (SPEC §5, 피드백 라운드 1, Task 1/7).
 *
 * The edge gate sits in the interview (convergence) flow, right after the forced-
 * question gate and before the detailed SPEC interview (SPEC §5.1). BinDesk
 * researches the domain, generates 2–3 candidate edges, evaluates each across four
 * dimensions, and pre-selects ONE recommendation — the user must face it but is not
 * forced to accept it (informed override, SPEC §5.4).
 *
 * An edge is a PROPRIETARY data/workflow system — `[구체적 데이터 소스] + [그걸
 * 가치로 바꾸는 자동화 파이프라인(실행 노가다)]` (SPEC §5.2). The LLM is the analyst
 * sitting on top of that system, never the edge itself; "AI로 분석"·"그냥 LLM 쓰기"
 * is explicitly prohibited as an edge.
 *
 * This file is pure domain types + guardrail predicates (no I/O). Persistence lives
 * in ./store; the gate's research/evaluation pipeline (later tasks) produces these
 * shapes and the audit session freezes the user's choice.
 */

/**
 * Two-tier verification depth (SPEC §5.3, "검증 비용 절충"). The pre-selected
 * recommendation is committed, so it gets FULL verification (existence + free +
 * accessibility all really searched, with sources). Other candidates get only the
 * core data source target-verified — tokens are spent on verifiable facts, not on
 * the judgment dimensions.
 */
export type VerificationLevel = "full" | "core";

/**
 * Outcome badge for a verifiable-fact dimension (SPEC §5.3 "미달 시 표기").
 * - "verified"   → ✓검증됨 (search succeeded with a source link + snippet)
 * - "unverified" → ⚠미검증가설 (no evidence found; CANNOT be the default recommendation)
 * - "warn"       → ⚠ (e.g. a paid/uncertain data-cost flag)
 */
export type VerificationBadge = "verified" | "unverified" | "warn";

/** Korean UI labels for each badge (UI 텍스트는 한국어 default). */
export const VERIFICATION_BADGE_LABEL: Readonly<Record<VerificationBadge, string>> = {
  verified: "✓검증됨",
  unverified: "⚠미검증가설",
  warn: "⚠",
};

/**
 * The four evaluation dimensions of a candidate (SPEC §5.3 평가표). Two are
 * verifiable facts (data existence, data cost) and require real search + a source;
 * two are intrinsic judgments (build difficulty, defensibility) evaluated by the
 * LLM with explicit reasoning.
 */
export type DimensionKey =
  /** 데이터 존재·무료·접근성 — verifiable; needs source link + snippet. */
  | "dataExistence"
  /** 구축 난이도(이 개발자가 가능한가) — judgment. */
  | "buildDifficulty"
  /** 방어성(왜 commodity 가 아닌가) — judgment; usual moat = 실행·유지보수 노가다. */
  | "defensibility"
  /** 데이터 비용 — verifiable; confirm a free tier exists. */
  | "dataCost";

export const ALL_DIMENSIONS: readonly DimensionKey[] = [
  "dataExistence",
  "buildDifficulty",
  "defensibility",
  "dataCost",
];

/** Whether a dimension is a checkable fact or an intrinsic judgment (SPEC §5.3). */
export type DimensionNature = "verifiable" | "judgment";

export const DIMENSION_NATURE: Readonly<Record<DimensionKey, DimensionNature>> = {
  dataExistence: "verifiable",
  buildDifficulty: "judgment",
  defensibility: "judgment",
  dataCost: "verifiable",
};

/** Korean labels for the dimensions (UI default 한국어). */
export const DIMENSION_LABEL: Readonly<Record<DimensionKey, string>> = {
  dataExistence: "데이터 존재·무료·접근성",
  buildDifficulty: "구축 난이도",
  defensibility: "방어성",
  dataCost: "데이터 비용",
};

/**
 * Result of verifying a verifiable-fact dimension (SPEC §5.3). Only attached to
 * "verifiable" dimensions. For a FULL-verified recommendation, a "verified" badge
 * MUST carry both a source link and an evidence snippet (SPEC §5.3:
 * "출처 링크 + 근거 스니펫 필수") — enforced by {@link verificationIsComplete}.
 *
 * Guardrail (SPEC §5.3, `feedback_no_unverified_negative_claims`): we never assert
 * absence/inaccessibility without verification. An unverified dimension is marked
 * ⚠미검증가설, not declared "does not exist".
 */
export interface VerificationResult {
  /** Depth actually applied to THIS dimension. */
  level: VerificationLevel;
  badge: VerificationBadge;
  /** True only when a real search found supporting evidence. */
  verified: boolean;
  /** 출처 링크 — required for a full-verified "verified" badge. */
  sourceUrl?: string;
  /** 근거 스니펫 — required for a full-verified "verified" badge. */
  snippet?: string;
  /** Where the evidence came from (Scout cache, web search, …). */
  via?: string;
  /** ISO timestamp the check ran. */
  checkedAt?: string;
}

/** Per-dimension entry in a candidate's evaluation table. */
export interface DimensionEvaluation {
  key: DimensionKey;
  nature: DimensionNature;
  /**
   * Assessment text. For judgment dims this is the LLM's reasoning (근거 논리 명시);
   * for verifiable dims it is a human summary of what verification found. Korean.
   */
  assessment: string;
  /**
   * LLM score 1–5 for JUDGMENT dims (higher = better: more feasible / more
   * defensible). Absent for verifiable dims (their signal is the verification badge).
   */
  score?: number;
  /** Present only for verifiable dims (dataExistence, dataCost); see nature. */
  verification?: VerificationResult;
}

/**
 * Prohibition filter tags (SPEC §5.2 금지 / §5.3 가드레일). Any tag present means
 * the candidate is disqualified from being the default recommendation; it is dropped
 * at the gate entrance or downgraded to ⚠.
 * - "AbstractAI"    → edge framed as abstract "AI로 분석"/"그냥 LLM 쓰기" (not a data/workflow system)
 * - "PaidExclusive" → relies on paid/proprietary/expensive data (위성·카드결제 등), or promises '비밀 알파'
 * - "Unverified"    → a required verifiable fact (existence/cost) could not be verified
 */
export type ProhibitionTag = "AbstractAI" | "PaidExclusive" | "Unverified";

export const ALL_PROHIBITION_TAGS: readonly ProhibitionTag[] = [
  "AbstractAI",
  "PaidExclusive",
  "Unverified",
];

/** Korean labels for prohibition tags (for the blocking card). */
export const PROHIBITION_TAG_LABEL: Readonly<Record<ProhibitionTag, string>> = {
  AbstractAI: "추상적 AI 활용 (데이터/워크플로 시스템 아님)",
  PaidExclusive: "유료·독점 데이터 의존",
  Unverified: "핵심 사실 미검증",
};

/**
 * One candidate edge (SPEC §5.2 step 2). An edge = a concrete data source + the
 * automation pipeline that turns it into value (the "실행 노가다" that is also the moat).
 */
export interface EdgeCandidate {
  /** Stable id, unique within an audit session. */
  id: string;
  /** Short title for the card (Korean). */
  title: string;
  /** [구체적 데이터 소스] — the concrete, public, free/scattered data source. */
  dataSource: string;
  /** [자동화 파이프라인] — how that source is turned into value (execution grind). */
  automationPipeline: string;
  /** The four-dimension evaluation table (SPEC §5.3). */
  dimensions: DimensionEvaluation[];
  /** Verification depth applied to this candidate as a whole. */
  verificationLevel: VerificationLevel;
  /** Disqualifying/downgrading tags; empty array = clean (SPEC §5.2/§5.3). */
  prohibitionTags: ProhibitionTag[];
  /** True for the single pre-selected recommendation (must be full-verified). */
  recommended: boolean;
  /** Why this was recommended (SPEC §5.2 step 4); set on the recommended candidate. */
  recommendationReason?: string;
  /**
   * True when the user typed this edge themselves at the §5.4 fallback ("직접 엣지
   * 입력"). Such an edge is unverified by construction — provenance is kept honest so
   * it is never displayed as machine-verified.
   */
  userProvided?: boolean;
}

/** Find a candidate's evaluation for one dimension, if present. */
export function dimensionOf(
  candidate: EdgeCandidate,
  key: DimensionKey,
): DimensionEvaluation | undefined {
  return candidate.dimensions.find((d) => d.key === key);
}

/**
 * A verifiable dimension's verification is COMPLETE only when it actually found
 * evidence AND (for full verification) carries both a source link and a snippet
 * (SPEC §5.3: "출처 링크 + 근거 스니펫 필수"). Core-level verified facts need a
 * source but not the snippet.
 */
export function verificationIsComplete(v: VerificationResult | undefined): boolean {
  if (!v || !v.verified || v.badge !== "verified") return false;
  if (v.level === "full") return Boolean(v.sourceUrl && v.snippet);
  return Boolean(v.sourceUrl);
}

/**
 * Guardrail (SPEC §5.3): a candidate CANNOT be the default recommendation when it
 * carries any prohibition tag, or when a verifiable dimension is not fully verified.
 * `⚠미검증`/`유료`/`존재 불확실` sources are dropped or downgraded and can never be
 * the default. This is the gatekeeper that BinDesk's pre-selection step must pass.
 */
export function isEligibleForRecommendation(candidate: EdgeCandidate): boolean {
  if (candidate.prohibitionTags.length > 0) return false;
  for (const key of ALL_DIMENSIONS) {
    if (DIMENSION_NATURE[key] !== "verifiable") continue;
    const dim = dimensionOf(candidate, key);
    if (!dim || !verificationIsComplete(dim.verification)) return false;
  }
  return true;
}

/**
 * Outcome of the gate's automatic pipeline for one idea (SPEC §5.2). When no edge is
 * found, `edgeFound` is false and there is no recommendation — BinDesk must NOT
 * auto-switch; it shows the three-way branch (SPEC §5.4) instead.
 */
export interface EdgeGateResult {
  /** The 2–3 generated candidates (SPEC §5.2 step 2). */
  candidates: EdgeCandidate[];
  /** Id of the single pre-selected recommendation, or null if none found. */
  recommendedEdgeId: string | null;
  /** False ⇒ §5.4 three-way branch must be shown (no auto-switch). */
  edgeFound: boolean;
  /** ISO timestamp domain research/evaluation completed. */
  researchedAt: string;
  /** Optional note when no eligible edge was found (for the §5.4 branch). */
  notFoundReason?: string;
}

/**
 * Find the pre-selected recommendation in a gate result and confirm it is legal:
 * eligible per the guardrail AND full-verified. Returns the candidate, or null if
 * the result has no (valid) recommendation. Defensive: a recommendedEdgeId that
 * points at an ineligible candidate is treated as "no recommendation".
 */
export function recommendedCandidate(result: EdgeGateResult): EdgeCandidate | null {
  if (!result.edgeFound || !result.recommendedEdgeId) return null;
  const c = result.candidates.find((x) => x.id === result.recommendedEdgeId);
  if (!c || !c.recommended) return null;
  if (c.verificationLevel !== "full" || !isEligibleForRecommendation(c)) return null;
  return c;
}
