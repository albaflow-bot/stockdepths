/**
 * Notification inbox domain (SPEC Task 10 / IA ⑤ 알림함).
 *
 * Two sources, both stored on-device:
 *  - daily_digest: the 9 AM digest delivered via FCM (server Task 5).
 *  - alert: event-driven target/stop-loss notes from the on-device rule engine
 *    (server Task 5 alerts) — each carries a one-line contextual buy/sell advice.
 */

export type NotificationKind = "daily_digest" | "alert";

/** Mirrors the on-device rule engine's AlertKind (server alerts/types). */
export type AlertCategory = "target_reached" | "stop_loss" | "approaching_target" | "approaching_stop";

export interface NotificationItem {
  /** Stable id (idempotent per logical event). */
  id: string;
  kind: NotificationKind;
  title: string;
  /** One-line contextual advice / summary shown in the list. */
  body: string;
  /** ISO timestamp the notification was created/received. */
  createdAt: string;
  read: boolean;
  // --- optional metadata ---
  /** alert: the ticker. */
  symbol?: string;
  /** alert: which threshold event. */
  category?: AlertCategory;
  /** digest: the recommendation date. */
  date?: string;
  /** digest: the picked symbols. */
  symbols?: string[];
}
