/**
 * Edge-aware SPEC interview injection (SPEC §5.1; Task 4 step 3–4).
 *
 * Once an edge is committed, the detailed SPEC interview must flow "엣지-aware": the
 * question prompts are pre-framed around the chosen `[데이터 소스] + [파이프라인]` so
 * the SPEC is shaped by the edge instead of ignoring it. This module is pure (no I/O):
 *  - {@link buildEdgeAwareQuestions} generates the injected questions from an edge.
 *  - {@link embedEdgeInSpec} renders the SPEC §5.6 "본 앱 채택 엣지" markdown from the
 *    chosen edge + the user's collected answers, ready to splice into the final SPEC.
 */

import { DIMENSION_LABEL, dimensionOf, type EdgeCandidate } from "./types.js";

/** One injected, edge-aware interview question. */
export interface SpecQuestion {
  id: string;
  /** Edge-aware prompt text (Korean), with the data source + pipeline injected. */
  prompt: string;
  /** Always true for questions from this module (they are edge-framed). */
  edgeAware: boolean;
}

/** A collected answer to one question. */
export interface SpecAnswer {
  questionId: string;
  answer: string;
}

/** Edge-aware SPEC interview state stored on the session. */
export interface SpecInterviewState {
  /** The edge id this interview is framed around (null when skipped). */
  edgeId: string | null;
  questions: SpecQuestion[];
  answers: SpecAnswer[];
  /** The rendered SPEC §5.6 markdown once answers are embedded. */
  embeddedSpec?: string;
}

/**
 * Generate edge-aware questions for the committed edge (Task 4 step 3). The headline
 * question injects the concrete data source + pipeline verbatim, e.g.
 * "이 'DART 공시 RSS' 를 '매일 크롤·정규화' 파이프라인에서 어떻게 활용하실 건가요?".
 * Two follow-ups probe defensibility (the 실행·유지보수 노가다 moat) and the
 * free/access durability of the source.
 */
export function buildEdgeAwareQuestions(edge: EdgeCandidate): SpecQuestion[] {
  const ds = edge.dataSource;
  const pipe = edge.automationPipeline;
  const defense = dimensionOf(edge, "defensibility")?.assessment ?? "실행·유지보수 노가다";

  return [
    {
      id: "edge-usage",
      prompt: `이 '${ds}' 를 '${pipe}' 파이프라인에서 구체적으로 어떻게 활용하실 건가요?`,
      edgeAware: true,
    },
    {
      id: "edge-defensibility",
      prompt: `방어성의 핵심은 '${defense}' 입니다. 이 실행·유지보수 노가다를 어떻게 지속적으로 유지하실 계획인가요?`,
      edgeAware: true,
    },
    {
      id: "edge-data-durability",
      prompt: `'${ds}' 의 무료·접근 조건이 바뀌거나 막히면, 어떤 대비책(대체 소스·우회)을 두실 건가요?`,
      edgeAware: true,
    },
  ];
}

/**
 * Render the SPEC §5.6 "본 앱 채택 엣지" markdown embedding the chosen edge + answers
 * (Task 4 step 4). `answers` may be partial; unanswered questions are shown as
 * "(미응답)" rather than dropped, so the SPEC honestly reflects what's missing.
 */
export function embedEdgeInSpec(edge: EdgeCandidate, answers: SpecAnswer[]): string {
  const byId = new Map(answers.map((a) => [a.questionId, a.answer] as const));
  const questions = buildEdgeAwareQuestions(edge);

  const lines: string[] = [];
  lines.push("### 5.6 본 앱 채택 엣지 (Adopted Engineering Edge)");
  lines.push("");
  lines.push(`- **엣지**: ${edge.title}`);
  lines.push(`- **데이터 소스**: ${edge.dataSource}`);
  lines.push(`- **자동화 파이프라인**: ${edge.automationPipeline}`);
  if (edge.recommendationReason) lines.push(`- **선정 이유**: ${edge.recommendationReason}`);

  lines.push("");
  lines.push("**평가표**");
  lines.push("");
  lines.push("| 차원 | 평가 |");
  lines.push("|------|------|");
  for (const dim of edge.dimensions) {
    const badge = dim.verification
      ? dim.verification.verified
        ? "✓검증됨"
        : "⚠미검증"
      : dim.score != null
        ? `${dim.score}/5`
        : "—";
    const note = (dim.verification?.snippet ?? dim.assessment).replace(/\|/g, "/");
    lines.push(`| ${DIMENSION_LABEL[dim.key]} | ${badge} — ${note} |`);
  }

  lines.push("");
  lines.push("**엣지-aware 인터뷰**");
  lines.push("");
  for (const q of questions) {
    lines.push(`- **Q. ${q.prompt}**`);
    lines.push(`  - ${byId.get(q.id)?.trim() || "(미응답)"}`);
  }

  return lines.join("\n");
}
