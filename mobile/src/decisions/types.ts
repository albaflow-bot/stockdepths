/**
 * User decision queue (피드백 라운드 3 delta). memory 정합 — **완결 착시 차단**:
 * deferred/미결정 항목을 코드 주석/SPEC 에만 묻지 않고 사용자가 결정하는 큐로 노출한다.
 * Mirrors `specs/decision-queue.md` (same ids + 요지). No login → the user's decision
 * is stored on-device only.
 */

import type { BadgeTone } from "../theme/tokens";

/** Three separated actions (BinDesk playbook: 보류·거부는 분리된 액션). */
export type DecisionStatus = "open" | "approved" | "deferred" | "rejected";

export type DecisionCategory = "data" | "scope" | "sources";

export interface DecisionItem {
  /** Stable id, shared with specs/decision-queue.md (e.g. "DQ-1"). */
  id: string;
  category: DecisionCategory;
  title: string;
  /** One-line plain-language summary (평어). */
  summary: string;
  /** What it is + current honest status. */
  detail: string;
  /** What the user needs to decide. */
  needs: string;
  /** SPEC reference for traceability. */
  spec: string;
  /** Default/seed status (open, or deferred for out-of-scope items). */
  status: DecisionStatus;
}

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  open: "결정 대기",
  approved: "승인됨",
  deferred: "보류됨",
  rejected: "거부됨",
};

export const DECISION_STATUS_TONE: Record<DecisionStatus, BadgeTone> = {
  open: "warning",
  approved: "positive",
  deferred: "neutral",
  rejected: "muted",
};

export const DECISION_CATEGORY_LABEL: Record<DecisionCategory, string> = {
  data: "시장 데이터",
  scope: "범위",
  sources: "출처",
};
