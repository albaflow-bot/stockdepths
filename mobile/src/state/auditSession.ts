/**
 * Client audit-flow state machine (Task 6): Phase 77 → 엣지 게이트 → SPEC 인터뷰.
 *
 * SPEC §5.1 flow: after the Phase-77 forced-question gate the session auto-enters
 * `edge_gate`; the user faces the EdgeGateModal (or §5.4 fallback), commits a choice
 * (Accept/Override/Skip/Input) which POSTs to the backend, and on success the session
 * transitions to `spec_interview` with the edge-aware questions injected.
 *
 * The reducer is PURE and exported for direct unit testing; {@link useAuditFlow} wires
 * it to the network with OPTIMISTIC updates + ERROR RECOVERY: a selection flips the
 * phase to `spec_interview` immediately and rolls back to `edge_gate` (surfacing the
 * error) if the request fails.
 */

import { useCallback, useReducer } from "react";
import { addBreadcrumb } from "../resilience/errorLog";
import {
  runEdgeGate as defaultRunEdgeGate,
  submitEdgeSelection as defaultSubmitEdgeSelection,
  submitCustomEdge as defaultSubmitCustomEdge,
} from "../flow/specInterview";
import type { EdgeGateResult, SpecInterviewResponse } from "../types/edge";

export type AuditPhase = "phase77" | "edge_gate" | "spec_interview" | "spec_finalized";

export interface AuditFlowState {
  sessionId: string;
  phase: AuditPhase;
  busy: boolean;
  error: string | null;
  gate: EdgeGateResult | null;
  interview: SpecInterviewResponse | null;
  /** Phase to restore if the in-flight (optimistic) op fails. */
  rollbackPhase: AuditPhase | null;
}

export function initialAuditState(sessionId: string, phase: AuditPhase = "phase77"): AuditFlowState {
  return { sessionId, phase, busy: false, error: null, gate: null, interview: null, rollbackPhase: null };
}

export type AuditAction =
  | { type: "enterEdgeGate" } // Phase 77 완료 → auto-enter edge_gate
  | { type: "gatePending" }
  | { type: "gateLoaded"; gate: EdgeGateResult }
  | { type: "selectPending" } // optimistic: edge_gate → spec_interview
  | { type: "selectDone"; interview: SpecInterviewResponse }
  | { type: "opFailed"; error: string }
  | { type: "reset"; sessionId: string; phase?: AuditPhase };

/** Pure transition function — the single source of truth for legal phase moves. */
export function auditReducer(state: AuditFlowState, action: AuditAction): AuditFlowState {
  switch (action.type) {
    case "enterEdgeGate":
      // Only auto-advance from the forced-question gate; otherwise no-op (idempotent).
      return state.phase === "phase77" ? { ...state, phase: "edge_gate", error: null } : state;
    case "gatePending":
      return { ...state, busy: true, error: null };
    case "gateLoaded":
      return { ...state, busy: false, error: null, gate: action.gate };
    case "selectPending":
      // Optimistic: jump to spec_interview now, remember where to roll back to.
      return { ...state, busy: true, error: null, rollbackPhase: state.phase, phase: "spec_interview" };
    case "selectDone":
      return {
        ...state,
        busy: false,
        error: null,
        interview: action.interview,
        phase: action.interview.status,
        rollbackPhase: null,
      };
    case "opFailed":
      // Error recovery: restore the optimistic rollback phase (if any).
      return {
        ...state,
        busy: false,
        error: action.error,
        phase: state.rollbackPhase ?? state.phase,
        rollbackPhase: null,
      };
    case "reset":
      return initialAuditState(action.sessionId, action.phase ?? "phase77");
    default:
      return state;
  }
}

/** Network seam — injectable so the hook is testable without real fetch. */
export interface AuditFlowClient {
  runEdgeGate(sessionId: string, idea: string, domain: string): Promise<EdgeGateResult>;
  submitEdgeSelection(sessionId: string, action: "accept" | "override" | "skip", edgeId: string | null): Promise<SpecInterviewResponse>;
  submitCustomEdge(sessionId: string, text: string): Promise<SpecInterviewResponse>;
}

const defaultClient: AuditFlowClient = {
  runEdgeGate: defaultRunEdgeGate,
  submitEdgeSelection: defaultSubmitEdgeSelection,
  submitCustomEdge: defaultSubmitCustomEdge,
};

export interface UseAuditFlowOptions {
  sessionId: string;
  idea: string;
  domain?: string;
  /** Starting phase (defaults to phase77). */
  phase?: AuditPhase;
  client?: AuditFlowClient;
}

export interface AuditFlowController {
  state: AuditFlowState;
  /** Phase 77 강제질문 완료 → enter edge_gate and load the gate. */
  completePhase77: () => Promise<void>;
  /** (Re)load the gate result for the current session. */
  loadGate: () => Promise<void>;
  accept: (edgeId: string) => Promise<void>;
  override: (edgeId: string) => Promise<void>;
  skip: () => Promise<void>;
  submitCustom: (text: string) => Promise<void>;
}

/**
 * React hook driving the audit flow. Each transition dispatches a pending action,
 * awaits the network, then a done/failed action — so the UI shows optimistic progress
 * and recovers (rolls back + surfaces the error) on failure.
 */
export function useAuditFlow(opts: UseAuditFlowOptions): AuditFlowController {
  const { sessionId, idea, domain = "", phase = "phase77", client = defaultClient } = opts;
  const [state, dispatch] = useReducer(auditReducer, initialAuditState(sessionId, phase));

  const loadGate = useCallback(async () => {
    dispatch({ type: "gatePending" });
    addBreadcrumb("audit: run edge gate");
    try {
      const gate = await client.runEdgeGate(sessionId, idea, domain);
      dispatch({ type: "gateLoaded", gate });
    } catch (err) {
      dispatch({ type: "opFailed", error: errMsg(err) });
    }
  }, [client, sessionId, idea, domain]);

  const completePhase77 = useCallback(async () => {
    dispatch({ type: "enterEdgeGate" });
    addBreadcrumb("audit: phase77 complete → edge_gate");
    await loadGate();
  }, [loadGate]);

  const commit = useCallback(
    async (run: () => Promise<SpecInterviewResponse>, label: string) => {
      dispatch({ type: "selectPending" });
      addBreadcrumb(`audit: ${label}`);
      try {
        const interview = await run();
        dispatch({ type: "selectDone", interview });
      } catch (err) {
        dispatch({ type: "opFailed", error: errMsg(err) });
      }
    },
    [],
  );

  const accept = useCallback(
    (edgeId: string) => commit(() => client.submitEdgeSelection(sessionId, "accept", edgeId), "accept"),
    [commit, client, sessionId],
  );
  const override = useCallback(
    (edgeId: string) => commit(() => client.submitEdgeSelection(sessionId, "override", edgeId), "override"),
    [commit, client, sessionId],
  );
  const skip = useCallback(
    () => commit(() => client.submitEdgeSelection(sessionId, "skip", null), "skip"),
    [commit, client, sessionId],
  );
  const submitCustom = useCallback(
    (text: string) => commit(() => client.submitCustomEdge(sessionId, text), "custom"),
    [commit, client, sessionId],
  );

  return { state, completePhase77, loadGate, accept, override, skip, submitCustom };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
}
