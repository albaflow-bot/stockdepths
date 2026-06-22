/**
 * Builders that turn a delivered digest or a fired on-device alert into a
 * NotificationItem. Pure — the FCM handler / rule-engine callsite passes the raw
 * fields and appends the result to the inbox repository.
 */

import { CATEGORY_LABEL } from "./labels";
import type { AlertCategory, NotificationItem } from "./types";

export interface DigestInput {
  date: string;
  marketContext: string;
  symbols: string[];
  createdAt: string;
}

/** Build a daily-digest notification (idempotent per market day via id). */
export function buildDigestNotification(input: DigestInput): NotificationItem {
  const symbols = input.symbols.join(", ");
  return {
    id: `digest:${input.date}`,
    kind: "daily_digest",
    title: `오늘의 추천 (${input.date})`,
    body: `${symbols}${input.marketContext ? ` · ${input.marketContext}` : ""}`,
    createdAt: input.createdAt,
    read: false,
    date: input.date,
    symbols: input.symbols,
  };
}

export interface AlertInput {
  symbol: string;
  category: AlertCategory;
  /** The one-line contextual note from the rule engine. */
  note: string;
  createdAt: string;
}

/** Build an event-driven alert notification from a rule-engine alert. */
export function buildAlertNotification(input: AlertInput): NotificationItem {
  const sym = input.symbol.toUpperCase();
  return {
    id: `alert:${sym}:${input.category}:${input.createdAt}`,
    kind: "alert",
    title: `${sym} ${CATEGORY_LABEL[input.category]}`,
    body: input.note,
    createdAt: input.createdAt,
    read: false,
    symbol: sym,
    category: input.category,
  };
}
