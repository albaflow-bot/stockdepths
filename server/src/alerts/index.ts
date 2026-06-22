/**
 * Public entry point for the on-device alert rule engine (Task 5).
 * Pure, portable TypeScript — imported unchanged by the on-device client.
 */

export {
  evaluateHolding,
  evaluateHoldings,
  resolveThresholds,
  PROFILE_THRESHOLDS,
} from "./ruleEngine.js";
export type {
  Holding,
  QuoteLike,
  Alert,
  AlertKind,
  AlertSeverity,
  RuleConfig,
  InvestorProfile,
} from "./types.js";
