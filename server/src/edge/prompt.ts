/**
 * Candidate-edge generation prompt + parser (SPEC §5.2 step 2–3).
 *
 * The LLM proposes 2–3 candidate edges from the idea + Scout research context. Each
 * candidate = `[구체적 데이터 소스] + [자동화 파이프라인(실행 노가다)]`. The LLM also
 * scores the two JUDGMENT dimensions (buildDifficulty, defensibility) with reasoning
 * — those need no search. It must NOT score the verifiable dimensions (existence,
 * cost); the service verifies those via Scout (SPEC §5.3: tokens on facts via search,
 * not the model). The model output is prompt-enforced JSON, parsed defensively here.
 */

import type { WebSearchResult } from "./scout.js";

export const EDGE_SYSTEM_PROMPT = `당신은 BinDesk 의 공학 엣지 분석가입니다. 주어진 아이디어/도메인에서 "엣지"를 찾습니다.
엣지 = [구체적인 공개 데이터 소스] + [그 데이터를 가치로 바꾸는 자동화 파이프라인(실행 노가다)] 의 결합입니다.
엣지는 독자적인 데이터/워크플로 시스템이며, LLM 은 그 위에 올라가는 분석가(부품)일 뿐입니다.

엄격한 금지 규칙:
- "AI 로 분석", "그냥 LLM 사용" 같은 추상적 활용을 엣지로 제시하지 마세요. 반드시 구체적 데이터 소스를 지목하세요.
- 유료·독점·고가 데이터(위성 영상·카드결제 내역 등)에 의존하는 엣지를 제시하지 마세요.
- "비밀 알파", "확실한 수익" 같은 보장을 약속하지 마세요.
- 데이터의 존재·무료 여부를 단정하지 마세요. 그건 별도 검증 단계에서 웹검색으로 확인합니다.

후보를 2~3개 생성하세요. 각 후보마다 구축 난이도와 방어성만 평가하고 점수를 매기세요(1~5).
오직 아래 JSON 만 출력하세요(다른 텍스트 금지):
{
  "candidates": [
    {
      "title": "짧은 제목",
      "dataSource": "구체적 데이터 소스 이름(무엇을 어디서)",
      "automationPipeline": "그 데이터를 가치로 바꾸는 자동화 파이프라인 설명(실행 노가다)",
      "buildDifficulty": { "score": 1-5, "assessment": "이 개발자가 구축 가능한지 근거 논리" },
      "defensibility": { "score": 1-5, "assessment": "왜 commodity 가 아닌지(보통 해자=실행·유지보수 노가다)" }
    }
  ]
}
score 의미: buildDifficulty.score = 실현 가능성(높을수록 이 개발자가 만들기 쉬움), defensibility.score = 방어성(높을수록 모방 어려움).`;

export function buildEdgeUserPrompt(
  idea: string,
  domain: string,
  research: WebSearchResult[],
): string {
  const lines: string[] = [];
  lines.push(`# 아이디어\n${idea}`);
  if (domain.trim()) lines.push(`\n# 도메인\n${domain}`);
  if (research.length > 0) {
    lines.push(`\n# 도메인 리서치(참고용 — 흩어지거나 느린 공개 데이터/워크플로 단서)`);
    for (const r of research.slice(0, 8)) {
      lines.push(`- ${r.title}: ${r.snippet} (${r.url})`);
    }
  } else {
    lines.push(`\n# 도메인 리서치\n(리서치 결과 없음 — 아이디어에서 직접 후보를 도출하세요.)`);
  }
  lines.push(`\n위 정보로 후보 엣지 2~3개를 JSON 으로 생성하세요.`);
  return lines.join("\n");
}

/** A judgment-dimension score+reasoning the model returns. */
export interface RawJudgment {
  score: number;
  assessment: string;
}

/** One candidate as parsed from the model output (pre-verification). */
export interface RawCandidate {
  title: string;
  dataSource: string;
  automationPipeline: string;
  buildDifficulty: RawJudgment;
  defensibility: RawJudgment;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Clamp a model score into 1..5; default 3 (neutral) when missing/garbage. */
function score(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function judgment(v: unknown): RawJudgment {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { score: score(o["score"]), assessment: str(o["assessment"]) ?? "근거 미제시" };
}

const MIN_CANDIDATES = 1;
const MAX_CANDIDATES = 3;

/**
 * Validate + normalize the model's parsed JSON into RawCandidate[]. Drops malformed
 * entries and entries missing a concrete data source or pipeline; clamps to at most
 * 3. Throws if nothing usable remains (the gate then reports has_edge_candidate=false
 * upstream rather than fabricating an edge).
 */
export function parseRawCandidates(obj: unknown): RawCandidate[] {
  if (!obj || typeof obj !== "object") throw new Error("edge model output was not an object");
  const root = obj as Record<string, unknown>;
  const raw = Array.isArray(root["candidates"]) ? (root["candidates"] as unknown[]) : [];

  const out: RawCandidate[] = [];
  for (const rc of raw) {
    if (!rc || typeof rc !== "object") continue;
    const c = rc as Record<string, unknown>;
    const dataSource = str(c["dataSource"]);
    const automationPipeline = str(c["automationPipeline"]);
    if (!dataSource || !automationPipeline) continue;
    out.push({
      title: str(c["title"]) ?? dataSource,
      dataSource,
      automationPipeline,
      buildDifficulty: judgment(c["buildDifficulty"]),
      defensibility: judgment(c["defensibility"]),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }

  if (out.length < MIN_CANDIDATES) {
    throw new Error("edge model returned no usable candidates");
  }
  return out;
}

export { MIN_CANDIDATES, MAX_CANDIDATES };
