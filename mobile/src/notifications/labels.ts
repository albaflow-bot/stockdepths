/**
 * Pure label/tone mapping for notification badges (design.md badge styling).
 */

import type { BadgeTone } from "../theme/tokens";
import type { AlertCategory, NotificationItem } from "./types";

export const CATEGORY_LABEL: Record<AlertCategory, string> = {
  target_reached: "목표가 도달",
  stop_loss: "손절선 도달",
  approaching_target: "목표가 근접",
  approaching_stop: "손절선 근접",
};

export const CATEGORY_TONE: Record<AlertCategory, BadgeTone> = {
  target_reached: "positive",
  stop_loss: "negative",
  approaching_target: "neutral",
  approaching_stop: "warning",
};

/** The badge (label + tone) to show for a notification item. */
export function notificationBadge(item: NotificationItem): { label: string; tone: BadgeTone } {
  if (item.kind === "daily_digest") return { label: "오늘의 추천", tone: "neutral" };
  if (item.category) return { label: CATEGORY_LABEL[item.category], tone: CATEGORY_TONE[item.category] };
  return { label: "알림", tone: "muted" };
}
