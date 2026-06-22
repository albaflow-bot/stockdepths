/**
 * Edge selection + SPEC-injection service (Task 4).
 *
 * Drives the gate→interview transition when the user acts on the blocking card:
 *  - accept  : commit the pre-selected recommendation
 *  - override: commit a different candidate (informed override, SPEC §5.4)
 *  - skip    : proceed with no edge (엣지 미감)
 * For accept/override it freezes the chosen edge's snapshot onto the session, moves
 * status `edge_gate`→`spec_interview`, records an audit-log event, and returns the
 * edge-aware interview questions (SPEC §5.1). Skip transitions the same way with no
 * edge and no questions. Answers are later embedded into the final SPEC §5.6.
 *
 * Pure orchestration over injected stores — no HTTP, fully testable.
 */

import { AuditSessionStore, type AuditSession } from "./store.js";
import { AuditLogStore } from "./auditLog.js";
import { buildEdgeAwareQuestions, embedEdgeInSpec, type SpecAnswer, type SpecInterviewState } from "./specInterview.js";
import { buildCustomCandidate, validateCustomEdge, type ExtractedEdge } from "./customEdge.js";
import type { EdgeCandidate } from "./types.js";

export type SelectionAction = "accept" | "override" | "skip";

export interface SelectionResult {
  session: AuditSession;
  interview: SpecInterviewState | null;
  /** Keywords extracted from a user-typed edge (§5.4 "직접 입력"); else undefined. */
  extracted?: ExtractedEdge;
}

/** Raised when a user-typed custom edge fails validation (§5.4 fallback). */
export class CustomEdgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomEdgeError";
  }
}

export class EdgeSelectionService {
  constructor(
    private readonly sessions: AuditSessionStore,
    private readonly auditLog: AuditLogStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * Commit a gate decision. For accept/override, `edgeId` must reference a candidate
   * in the session's frozen `edgeMetadata`. Returns the updated session + the
   * edge-aware interview (null for skip). Throws on a missing session or an edge id
   * that isn't in the gate result (never fabricate a selection).
   */
  commit(sessionId: string, action: SelectionAction, edgeId: string | null): SelectionResult {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`audit session not found: ${sessionId}`);
    const at = this.now();

    if (action === "skip") {
      const updated = this.sessions.commitSelection(sessionId, null, "spec_interview", at);
      this.auditLog.record(sessionId, "edge_gate_skipped", at);
      this.auditLog.record(sessionId, "spec_interview_started", at, { edgeId: null });
      return { session: updated, interview: null };
    }

    const edge = this.findEdge(session, edgeId);
    const interview: SpecInterviewState = {
      edgeId: edge.id,
      questions: buildEdgeAwareQuestions(edge),
      answers: [],
    };
    let updated = this.sessions.commitSelection(sessionId, edge, "spec_interview", at);
    updated = this.sessions.setSpecInterview(sessionId, interview, "spec_interview", at);

    this.auditLog.record(
      sessionId,
      action === "accept" ? "edge_gate_selected" : "edge_gate_overridden",
      at,
      { edgeId: edge.id, dataSource: edge.dataSource, automationPipeline: edge.automationPipeline },
    );
    this.auditLog.record(sessionId, "spec_interview_started", at, { edgeId: edge.id });
    return { session: updated, interview };
  }

  /**
   * §5.4 fallback "직접 엣지 입력": validate the user's free-text edge, extract
   * keywords, synthesize an unverified user-provided candidate, commit it (counts as an
   * informed override → audited), transition to spec_interview, and return the
   * edge-aware questions + the extracted keywords. Throws {@link CustomEdgeError} when
   * the text fails validation. The session need not have any auto-found candidates.
   */
  submitCustomEdge(sessionId: string, text: string): SelectionResult {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`audit session not found: ${sessionId}`);
    const v = validateCustomEdge(text);
    if (!v.ok) throw new CustomEdgeError(v.reason);

    const at = this.now();
    const { candidate, extracted } = buildCustomCandidate(text, at);
    const interview: SpecInterviewState = {
      edgeId: candidate.id,
      questions: buildEdgeAwareQuestions(candidate),
      answers: [],
    };
    this.sessions.commitSelection(sessionId, candidate, "spec_interview", at);
    const updated = this.sessions.setSpecInterview(sessionId, interview, "spec_interview", at);

    this.auditLog.record(sessionId, "edge_gate_custom", at, {
      dataSource: candidate.dataSource,
      automationPipeline: candidate.automationPipeline,
      keywords: extracted.keywords,
    });
    this.auditLog.record(sessionId, "spec_interview_started", at, { edgeId: candidate.id });
    return { session: updated, interview, extracted };
  }

  /**
   * Collect the user's interview answers and embed the chosen edge + answers into the
   * final SPEC §5.6 (Task 4 step 4). Transitions to `spec_finalized`. Throws if there
   * is no edge-framed interview to answer (e.g. the user skipped the edge).
   */
  submitAnswers(sessionId: string, answers: SpecAnswer[]): SelectionResult {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`audit session not found: ${sessionId}`);
    const edge = session.selectedEdge;
    const prior = session.specInterview;
    if (!edge || !prior) {
      throw new Error(`no edge-framed interview to finalize for session: ${sessionId}`);
    }
    const at = this.now();
    const merged = mergeAnswers(prior.answers, answers);
    const interview: SpecInterviewState = {
      ...prior,
      answers: merged,
      embeddedSpec: embedEdgeInSpec(edge, merged),
    };
    const updated = this.sessions.setSpecInterview(sessionId, interview, "spec_finalized", at);
    this.auditLog.record(sessionId, "spec_finalized", at, { edgeId: edge.id });
    return { session: updated, interview };
  }

  private findEdge(session: AuditSession, edgeId: string | null): EdgeCandidate {
    if (!edgeId) throw new Error("edgeId is required for accept/override");
    const edge = session.edgeMetadata?.candidates.find((c) => c.id === edgeId);
    if (!edge) throw new Error(`edge not found in gate result: ${edgeId}`);
    return edge;
  }
}

/** Merge new answers over prior ones, keyed by questionId (last write wins). */
function mergeAnswers(prior: SpecAnswer[], incoming: SpecAnswer[]): SpecAnswer[] {
  const byId = new Map(prior.map((a) => [a.questionId, a] as const));
  for (const a of incoming) {
    if (a && typeof a.questionId === "string" && typeof a.answer === "string") {
      byId.set(a.questionId, { questionId: a.questionId, answer: a.answer });
    }
  }
  return [...byId.values()];
}
