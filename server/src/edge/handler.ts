/**
 * HTTP handler for the edge gate (SPEC §5.2; Task 2/7).
 *
 * POST /api/audit-session/{id}/edge-gate
 *   body: { idea: string, domain?: string, ideaSummary?: string }
 *   → runs the gate, freezes the result onto the audit session's edge_metadata
 *     column (NOT a selection — facing is forced, accepting is not, SPEC §5.4), and
 *     returns the candidates + the pre-selected recommendation.
 *
 * Response shape uses snake_case keys the SPEC names directly (has_edge_candidate,
 * pre_selected) so the client/UI contract matches the task spec. Pure-ish: services
 * are injected, returns { status, body } — testable without opening a socket
 * (mirrors ../api/handlers).
 */

import { LlmError } from "../llm/types.js";
import { EdgeGateService } from "./service.js";
import { AuditSessionStore } from "./store.js";
import { AuditLogStore } from "./auditLog.js";
import { EdgeSelectionService, CustomEdgeError, type SelectionAction } from "./selection.js";
import type { SpecAnswer, SpecInterviewState } from "./specInterview.js";
import { recommendedCandidate, type EdgeCandidate, type EdgeGateResult } from "./types.js";

export interface EdgeGateApiResponse {
  status: number;
  body: unknown;
}

export interface EdgeGateDeps {
  service: EdgeGateService;
  sessions: AuditSessionStore;
  /** Selection + SPEC-injection service (Task 4). */
  selection: EdgeSelectionService;
  now: () => string;
}

export function defaultEdgeGateDeps(): EdgeGateDeps {
  const sessions = new AuditSessionStore();
  const auditLog = new AuditLogStore();
  const now = () => new Date().toISOString();
  return {
    service: new EdgeGateService(),
    sessions,
    selection: new EdgeSelectionService(sessions, auditLog, now),
    now,
  };
}

/** Add the SPEC-named `pre_selected` flag to each candidate for the blocking card. */
function toResponseCandidate(c: EdgeCandidate, recommendedId: string | null) {
  return { ...c, pre_selected: c.id === recommendedId && c.recommended };
}

function toResponseBody(sessionId: string, result: EdgeGateResult) {
  const recommended = recommendedCandidate(result);
  return {
    session_id: sessionId,
    has_edge_candidate: result.edgeFound,
    recommended_edge_id: result.recommendedEdgeId,
    pre_selected_edge: recommended ? toResponseCandidate(recommended, recommended.id) : null,
    candidates: result.candidates.map((c) => toResponseCandidate(c, result.recommendedEdgeId)),
    researched_at: result.researchedAt,
    ...(result.notFoundReason ? { not_found_reason: result.notFoundReason } : {}),
  };
}

/**
 * Handle POST /api/audit-session/{id}/edge-gate. `id` is the path segment; `body` is
 * the already-parsed JSON request body.
 */
export async function handleEdgeGate(
  sessionId: string,
  body: unknown,
  deps: EdgeGateDeps,
): Promise<EdgeGateApiResponse> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const idea = typeof b["idea"] === "string" ? b["idea"].trim() : "";
  const domain = typeof b["domain"] === "string" ? b["domain"].trim() : "";
  if (!idea) {
    return { status: 400, body: { error: "idea is required" } };
  }
  if (!sessionId) {
    return { status: 400, body: { error: "audit session id is required" } };
  }

  const ideaSummary = typeof b["ideaSummary"] === "string" && b["ideaSummary"].trim()
    ? b["ideaSummary"].trim()
    : idea.slice(0, 120);
  deps.sessions.create(sessionId, ideaSummary, deps.now());

  let result: EdgeGateResult;
  try {
    result = await deps.service.run(idea, domain);
  } catch (err) {
    // Infra failure (no LLM provider / all providers failed) is a SYSTEM fault,
    // distinct from "no eligible edge". Surface it; don't masquerade as "no edge".
    if (err instanceof LlmError) {
      return { status: 502, body: { error: err.message } };
    }
    throw err;
  }

  // Freeze the gate result onto the session (edge_metadata column). No auto-select.
  deps.sessions.attachEdgeMetadata(sessionId, result, deps.now());

  return { status: 200, body: toResponseBody(sessionId, result) };
}

/**
 * Match `/api/audit-session/{id}/edge-gate` and extract the id. Returns null when the
 * path is not this route.
 */
export function matchEdgeGatePath(pathname: string): { sessionId: string } | null {
  const m = /^\/api\/audit-session\/([^/]+)\/edge-gate\/?$/.exec(pathname);
  if (!m) return null;
  return { sessionId: decodeURIComponent(m[1]!) };
}

/** Match `/api/audit-session/{id}/edge-gate/select`. */
export function matchEdgeSelectPath(pathname: string): { sessionId: string } | null {
  const m = /^\/api\/audit-session\/([^/]+)\/edge-gate\/select\/?$/.exec(pathname);
  if (!m) return null;
  return { sessionId: decodeURIComponent(m[1]!) };
}

/** Match `/api/audit-session/{id}/spec-interview/answers`. */
export function matchSpecAnswersPath(pathname: string): { sessionId: string } | null {
  const m = /^\/api\/audit-session\/([^/]+)\/spec-interview\/answers\/?$/.exec(pathname);
  if (!m) return null;
  return { sessionId: decodeURIComponent(m[1]!) };
}

const SELECTION_ACTIONS: readonly SelectionAction[] = ["accept", "override", "skip"];
/** All actions the §5.4 three-way branch can send (adds "custom" = 직접 입력). */
const ALL_ACTIONS = [...SELECTION_ACTIONS, "custom"] as const;

function interviewBody(
  sessionId: string,
  interview: SpecInterviewState | null,
  status: string,
  extras: Record<string, unknown> = {},
) {
  return {
    session_id: sessionId,
    status,
    selected_edge_id: interview?.edgeId ?? null,
    questions: interview?.questions ?? [],
    embedded_spec: interview?.embeddedSpec ?? null,
    ...extras,
  };
}

/**
 * POST /api/audit-session/{id}/edge-gate/select
 *   body: { action: "accept"|"override"|"skip"|"custom", edgeId?: string, text?: string }
 * The §5.4 three-way branch: accept/override commit a provided candidate, "custom"
 * accepts a user-typed edge (validated + keyword-extracted), skip proceeds with no
 * edge. Transitions to spec_interview, logs the audit event, and returns the
 * edge-aware interview questions (and, for custom, the extracted keywords).
 */
export async function handleEdgeSelect(
  sessionId: string,
  body: unknown,
  deps: EdgeGateDeps,
): Promise<EdgeGateApiResponse> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = b["action"];
  if (typeof action !== "string" || !(ALL_ACTIONS as readonly string[]).includes(action)) {
    return { status: 400, body: { error: "action must be one of accept|override|skip|custom" } };
  }

  try {
    if (action === "custom") {
      const text = typeof b["text"] === "string" ? b["text"] : "";
      const { session, interview, extracted } = deps.selection.submitCustomEdge(sessionId, text);
      return {
        status: 200,
        body: interviewBody(sessionId, interview, session.status, { keywords: extracted?.keywords ?? [] }),
      };
    }
    const edgeId = typeof b["edgeId"] === "string" ? b["edgeId"] : null;
    const { session, interview } = deps.selection.commit(sessionId, action as SelectionAction, edgeId);
    return { status: 200, body: interviewBody(sessionId, interview, session.status) };
  } catch (err) {
    // Bad user text → 400 (recoverable); missing session / unknown edge → 404.
    if (err instanceof CustomEdgeError) {
      return { status: 400, body: { error: err.message } };
    }
    return { status: 404, body: { error: err instanceof Error ? err.message : "selection failed" } };
  }
}

/**
 * POST /api/audit-session/{id}/spec-interview/answers
 *   body: { answers: { questionId, answer }[] }
 * Collects the user's answers and embeds the chosen edge + answers into the final
 * SPEC §5.6, returning the embedded markdown (Task 4 step 4).
 */
export async function handleSpecAnswers(
  sessionId: string,
  body: unknown,
  deps: EdgeGateDeps,
): Promise<EdgeGateApiResponse> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const raw = Array.isArray(b["answers"]) ? (b["answers"] as unknown[]) : [];
  const answers: SpecAnswer[] = raw
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .filter((a) => typeof a["questionId"] === "string" && typeof a["answer"] === "string")
    .map((a) => ({ questionId: a["questionId"] as string, answer: a["answer"] as string }));
  try {
    const { session, interview } = deps.selection.submitAnswers(sessionId, answers);
    return { status: 200, body: interviewBody(sessionId, interview, session.status) };
  } catch (err) {
    return { status: 404, body: { error: err instanceof Error ? err.message : "submit failed" } };
  }
}
