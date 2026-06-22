/**
 * Client flow for edge selection → edge-aware SPEC interview (Task 4).
 *
 * Wires the EdgeGateModal's Accept / Override / Skip actions to the backend:
 *  - {@link submitEdgeSelection} commits the gate decision and returns the injected,
 *    edge-aware interview questions (SPEC §5.1).
 *  - {@link submitSpecAnswers} sends the user's answers and returns the embedded
 *    final-SPEC markdown (SPEC §5.6).
 *
 * Reads the API base URL the same way as ../data/picksClient and degrades gracefully
 * with a friendly Korean error rather than crashing (RESILIENCE CONTRACT).
 */

import { apiBaseUrl } from "../data/config";
import type {
  EdgeCandidate,
  EdgeGateResult,
  SpecAnswer,
  SpecInterviewResponse,
  SpecQuestion,
} from "../types/edge";

export type EdgeSelectionAction = "accept" | "override" | "skip" | "custom";

export class EdgeFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EdgeFlowError";
  }
}

/** Normalize the server's snake_case body into the client camelCase shape. */
function toResponse(raw: unknown): SpecInterviewResponse {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    sessionId: String(b["session_id"] ?? ""),
    status: (b["status"] as SpecInterviewResponse["status"]) ?? "edge_gate",
    selectedEdgeId: (b["selected_edge_id"] as string | null) ?? null,
    questions: Array.isArray(b["questions"]) ? (b["questions"] as SpecQuestion[]) : [],
    embeddedSpec: (b["embedded_spec"] as string | null) ?? null,
    keywords: Array.isArray(b["keywords"]) ? (b["keywords"] as string[]) : [],
  };
}

async function postRawJson(path: string, body: unknown): Promise<unknown> {
  const base = apiBaseUrl();
  if (!base) {
    throw new EdgeFlowError("서버가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  }
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new EdgeFlowError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  if (!res.ok) {
    throw new EdgeFlowError(`요청을 처리하지 못했습니다 (오류 ${res.status}).`);
  }
  return res.json();
}

async function postJson(path: string, body: unknown): Promise<SpecInterviewResponse> {
  return toResponse(await postRawJson(path, body));
}

/** Normalize the gate endpoint's snake_case body into the client EdgeGateResult. */
function toGateResult(raw: unknown): EdgeGateResult {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    candidates: Array.isArray(b["candidates"]) ? (b["candidates"] as EdgeCandidate[]) : [],
    recommendedEdgeId: (b["recommended_edge_id"] as string | null) ?? null,
    edgeFound: Boolean(b["has_edge_candidate"]),
    researchedAt: String(b["researched_at"] ?? ""),
    notFoundReason: (b["not_found_reason"] as string | undefined) ?? undefined,
  };
}

/**
 * Run the edge gate for a session (SPEC §5.2): POST the idea/domain, get back the
 * candidates + pre-selected recommendation (or has_edge_candidate=false).
 */
export async function runEdgeGate(
  sessionId: string,
  idea: string,
  domain = "",
): Promise<EdgeGateResult> {
  return toGateResult(
    await postRawJson(`/api/audit-session/${encodeURIComponent(sessionId)}/edge-gate`, {
      idea,
      domain,
    }),
  );
}

/**
 * Commit the gate decision for a session. For accept/override pass the chosen
 * `edgeId`; for skip pass null. Returns the edge-aware interview (empty questions on
 * skip).
 */
export function submitEdgeSelection(
  sessionId: string,
  action: EdgeSelectionAction,
  edgeId: string | null,
): Promise<SpecInterviewResponse> {
  return postJson(`/api/audit-session/${encodeURIComponent(sessionId)}/edge-gate/select`, {
    action,
    edgeId,
  });
}

/**
 * §5.4 fallback "직접 엣지 입력": submit a user-typed edge. The server validates +
 * extracts keywords and returns the edge-aware interview (with `keywords`).
 */
export function submitCustomEdge(
  sessionId: string,
  text: string,
): Promise<SpecInterviewResponse> {
  return postJson(`/api/audit-session/${encodeURIComponent(sessionId)}/edge-gate/select`, {
    action: "custom",
    text,
  });
}

/** Send the collected interview answers; returns the embedded final-SPEC markdown. */
export function submitSpecAnswers(
  sessionId: string,
  answers: SpecAnswer[],
): Promise<SpecInterviewResponse> {
  return postJson(`/api/audit-session/${encodeURIComponent(sessionId)}/spec-interview/answers`, {
    answers,
  });
}
