/**
 * Client-side mirror of the server's Engineering Edge Gate contract (server Tasks
 * 1–2, SPEC §5). Kept as a thin local copy so the mobile package stays decoupled
 * from the server package's build (same convention as ./picks). Shapes must match the
 * server `EdgeGateResult` / `EdgeCandidate` / `DimensionEvaluation` /
 * `VerificationResult` on the wire.
 */

export type VerificationLevel = "full" | "core";
export type VerificationBadge = "verified" | "unverified" | "warn";
export type DimensionKey = "dataExistence" | "buildDifficulty" | "defensibility" | "dataCost";
export type DimensionNature = "verifiable" | "judgment";
export type ProhibitionTag = "AbstractAI" | "PaidExclusive" | "Unverified";

export interface VerificationResult {
  level: VerificationLevel;
  badge: VerificationBadge;
  verified: boolean;
  /** 출처 링크 (verifiable dims, when found). */
  sourceUrl?: string;
  /** 근거 스니펫. */
  snippet?: string;
  via?: string;
  checkedAt?: string;
}

export interface DimensionEvaluation {
  key: DimensionKey;
  nature: DimensionNature;
  assessment: string;
  /** LLM 1–5 score for judgment dims. */
  score?: number;
  verification?: VerificationResult;
}

export interface EdgeCandidate {
  id: string;
  title: string;
  dataSource: string;
  automationPipeline: string;
  dimensions: DimensionEvaluation[];
  verificationLevel: VerificationLevel;
  prohibitionTags: ProhibitionTag[];
  recommended: boolean;
  recommendationReason?: string;
}

export interface EdgeGateResult {
  candidates: EdgeCandidate[];
  recommendedEdgeId: string | null;
  edgeFound: boolean;
  researchedAt: string;
  notFoundReason?: string;
}

/** Session lifecycle stage (mirrors server AuditSessionStatus). */
export type AuditSessionStatus = "edge_gate" | "spec_interview" | "spec_finalized";

/** Edge-aware SPEC interview question injected after a selection (Task 4). */
export interface SpecQuestion {
  id: string;
  prompt: string;
  edgeAware: boolean;
}

/** A collected answer to one interview question. */
export interface SpecAnswer {
  questionId: string;
  answer: string;
}

/** Server response from the select / answers endpoints. */
export interface SpecInterviewResponse {
  sessionId: string;
  status: AuditSessionStatus;
  selectedEdgeId: string | null;
  questions: SpecQuestion[];
  embeddedSpec: string | null;
  /** Keywords extracted from a user-typed edge (§5.4 "직접 입력"); else empty. */
  keywords: string[];
}

/** Korean labels for the four dimensions (UI default 한국어, SPEC §5.3). */
export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  dataExistence: "데이터 존재·무료·접근성",
  buildDifficulty: "구축 난이도",
  defensibility: "방어성",
  dataCost: "데이터 비용",
};

/** Korean labels for prohibition tags (the ❌드롭됨 reasons). */
export const PROHIBITION_TAG_LABEL: Record<ProhibitionTag, string> = {
  AbstractAI: "추상적 AI 활용",
  PaidExclusive: "유료·독점 데이터",
  Unverified: "핵심 사실 미검증",
};

/** A display badge derived for the evaluation table / card. */
export type DisplayBadge =
  | { kind: "verified"; label: "✓검증됨" } // full verification passed
  | { kind: "unverified"; label: "⚠미검증" } // core-only / not yet verified / warn
  | { kind: "dropped"; label: "❌드롭됨" }; // disqualified by a prohibition tag

/**
 * Display badge for ONE verifiable dimension (SPEC §5.3 badges). Judgment dimensions
 * have no badge (they carry a score instead) → returns null.
 */
export function dimensionBadge(dim: DimensionEvaluation): DisplayBadge | null {
  if (dim.nature !== "verifiable") return null;
  const v = dim.verification;
  if (v && v.verified && v.badge === "verified" && v.level === "full") {
    return { kind: "verified", label: "✓검증됨" };
  }
  return { kind: "unverified", label: "⚠미검증" };
}

/**
 * Card-level badge. A candidate carrying any prohibition tag is ❌드롭됨 (can never be
 * the recommendation, SPEC §5.3 가드레일); a fully-verified recommendation is
 * ✓검증됨; otherwise ⚠미검증 (core-only).
 */
export function candidateBadge(c: EdgeCandidate): DisplayBadge {
  if (c.prohibitionTags.length > 0) return { kind: "dropped", label: "❌드롭됨" };
  if (c.recommended && c.verificationLevel === "full") {
    return { kind: "verified", label: "✓검증됨" };
  }
  return { kind: "unverified", label: "⚠미검증" };
}
