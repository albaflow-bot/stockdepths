/**
 * Custom (user-typed) edge handling for the §5.4 fallback (Task 5, "직접 엣지 입력").
 *
 * When the gate finds no eligible edge, the user may type their own. We validate the
 * text and extract keywords / a coarse data-source + pipeline split, then synthesize an
 * {@link EdgeCandidate} flagged `userProvided` so the SPEC interview can flow
 * edge-aware around it. Pure (no I/O), so it is fully testable.
 *
 * Honesty (SPEC §5.3 가드레일): a user-typed edge is UNVERIFIED by construction — we
 * never mark it machine-verified. Its existence/cost dimensions are recorded as
 * unverified with a "사용자 입력 — 미검증" note rather than asserted true.
 */

import type { DimensionEvaluation, EdgeCandidate } from "./types.js";

/** Korean + English stopwords dropped from keyword extraction. */
const STOPWORDS = new Set([
  "그리고", "그러나", "또는", "에서", "으로", "하는", "해서", "통해", "위한", "관련",
  "그것", "이것", "저것", "등을", "등의", "있는", "없는", "대한", "통한", "들을",
  "the", "a", "an", "of", "to", "and", "or", "for", "with", "via", "by", "in", "on",
]);

/** Trailing Korean particles to strip from a token's tail. */
const PARTICLE = /(을|를|이|가|은|는|에|의|로|으로|에서|와|과|도|만|랑|이랑)$/;

export interface ExtractedEdge {
  /** Distinct content keywords (lowercased), most useful first, capped. */
  keywords: string[];
  /** Coarse data-source phrase parsed from the text. */
  dataSource: string;
  /** Coarse automation-pipeline phrase parsed from the text. */
  automationPipeline: string;
}

export interface CustomEdgeValidation {
  ok: boolean;
  /** Korean reason when not ok (shown to the user); empty when ok. */
  reason: string;
}

const MIN_LEN = 4;

/** Validate the user's free-text edge. Non-empty and a sensible minimum length. */
export function validateCustomEdge(text: string): CustomEdgeValidation {
  const t = (text ?? "").trim();
  if (!t) return { ok: false, reason: "엣지 설명을 입력해 주세요." };
  if (t.length < MIN_LEN) return { ok: false, reason: `조금 더 구체적으로 입력해 주세요 (최소 ${MIN_LEN}자).` };
  return { ok: true, reason: "" };
}

/**
 * Extract keywords + a coarse data-source/pipeline split from free text. If the text
 * contains an explicit separator (→, +, :, —, /, "로", "에서") we split on the first
 * one; otherwise the whole text is the data source and the pipeline is left for the
 * detailed interview to refine.
 */
export function extractEdgeKeywords(text: string): ExtractedEdge {
  const t = text.trim();

  // Keywords: tokenize on non-word (Unicode-aware), strip particles, drop stopwords.
  const tokens = t
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.trim().toLowerCase().replace(PARTICLE, ""))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const keywords = [...new Set(tokens)].slice(0, 8);

  // Coarse data-source / pipeline split on the first separator we find.
  const sepMatch = t.match(/\s*(?:→|->|\+|:|—|\/| 로 | 에서 )\s*/);
  let dataSource = t;
  let automationPipeline = "사용자 입력 파이프라인 (상세 인터뷰에서 구체화).";
  if (sepMatch && sepMatch.index !== undefined) {
    dataSource = t.slice(0, sepMatch.index).trim() || t;
    const rest = t.slice(sepMatch.index + sepMatch[0].length).trim();
    if (rest) automationPipeline = rest;
  }
  // Keep the data source phrase reasonably short for the card.
  if (dataSource.length > 120) dataSource = dataSource.slice(0, 117).trimEnd() + "…";

  return { keywords, dataSource, automationPipeline };
}

/**
 * Synthesize an unverified, user-provided {@link EdgeCandidate} from free text. The
 * verifiable dimensions are recorded as UNVERIFIED (honest provenance); judgment
 * dimensions carry the user's own framing. Used by the §5.4 "직접 입력" branch.
 */
export function buildCustomCandidate(text: string, now: string): { candidate: EdgeCandidate; extracted: ExtractedEdge } {
  const extracted = extractEdgeKeywords(text);
  const unverifiedNote = "사용자 입력 — 미검증 (자동 검증되지 않았습니다).";
  const dimensions: DimensionEvaluation[] = [
    {
      key: "dataExistence",
      nature: "verifiable",
      assessment: unverifiedNote,
      verification: { level: "core", badge: "unverified", verified: false, checkedAt: now },
    },
    { key: "buildDifficulty", nature: "judgment", assessment: "사용자가 직접 제시한 엣지." },
    { key: "defensibility", nature: "judgment", assessment: "사용자가 직접 제시한 엣지." },
    {
      key: "dataCost",
      nature: "verifiable",
      assessment: unverifiedNote,
      verification: { level: "core", badge: "unverified", verified: false, checkedAt: now },
    },
  ];
  const candidate: EdgeCandidate = {
    id: "edge-custom",
    title: `직접 입력 엣지: ${extracted.keywords.slice(0, 3).join(", ") || "사용자 정의"}`,
    dataSource: extracted.dataSource,
    automationPipeline: extracted.automationPipeline,
    dimensions,
    verificationLevel: "core",
    prohibitionTags: [],
    recommended: false,
    userProvided: true,
  };
  return { candidate, extracted };
}
