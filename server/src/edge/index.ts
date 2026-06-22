/**
 * Public entry point for the Engineering Edge Gate domain model (SPEC §5, Task 1/7).
 *
 * Task 1 defines the domain types + guardrails and the audit-session store with the
 * `selectedEdgeId` / `edgeMetadata` columns. Later tasks add the research/evaluation
 * pipeline and the blocking-card UI that consume these shapes.
 */

export {
  VERIFICATION_BADGE_LABEL,
  DIMENSION_LABEL,
  DIMENSION_NATURE,
  ALL_DIMENSIONS,
  PROHIBITION_TAG_LABEL,
  ALL_PROHIBITION_TAGS,
  dimensionOf,
  verificationIsComplete,
  isEligibleForRecommendation,
  recommendedCandidate,
} from "./types.js";
export type {
  VerificationLevel,
  VerificationBadge,
  VerificationResult,
  DimensionKey,
  DimensionNature,
  DimensionEvaluation,
  ProhibitionTag,
  EdgeCandidate,
  EdgeGateResult,
} from "./types.js";

export { AuditSessionStore } from "./store.js";
export type {
  AuditSession,
  AuditSessionStatus,
  AuditSessionStoreOptions,
  EdgeGateMetadata,
} from "./store.js";

// --- Task 4: selection save + SPEC injection + audit log ---
export { AuditLogStore } from "./auditLog.js";
export type { AuditEvent, AuditEventType, AuditLogStoreOptions } from "./auditLog.js";
export { EdgeSelectionService, CustomEdgeError } from "./selection.js";
export type { SelectionAction, SelectionResult } from "./selection.js";
export {
  validateCustomEdge,
  extractEdgeKeywords,
  buildCustomCandidate,
} from "./customEdge.js";
export type { ExtractedEdge, CustomEdgeValidation } from "./customEdge.js";
export { buildEdgeAwareQuestions, embedEdgeInSpec } from "./specInterview.js";
export type { SpecQuestion, SpecAnswer, SpecInterviewState } from "./specInterview.js";

// --- Task 2: backend pipeline (Scout + generation + evaluation) ---
export { ScoutClient, NullWebSearch } from "./scout.js";
export type { WebSearch, WebSearchResult, ScoutClientOptions } from "./scout.js";
export {
  EdgeGateService,
  defaultEdgeGateService,
  existenceVerified,
  candidateScore,
} from "./service.js";
export type { EdgeGateServiceOptions } from "./service.js";
export {
  handleEdgeGate,
  handleEdgeSelect,
  handleSpecAnswers,
  matchEdgeGatePath,
  matchEdgeSelectPath,
  matchSpecAnswersPath,
  defaultEdgeGateDeps,
} from "./handler.js";
export type { EdgeGateDeps, EdgeGateApiResponse } from "./handler.js";
