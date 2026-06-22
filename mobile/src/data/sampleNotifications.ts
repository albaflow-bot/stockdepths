/**
 * Sample inbox items for component tests + local preview (mix of digests and
 * on-device alerts, some unread).
 */

import type { NotificationItem } from "../notifications/types";

export const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "alert:NVDA:target_reached:2026-06-21T13:05:00Z",
    kind: "alert",
    category: "target_reached",
    symbol: "NVDA",
    title: "NVDA 목표가 도달",
    body: "NVDA 목표가 도달 (수익률 +22.1%). 흐름을 고려해 분할 매도를 검토하세요. (오늘 +2.9%)",
    createdAt: "2026-06-21T13:05:00Z",
    read: false,
  },
  {
    id: "alert:TSLA:stop_loss:2026-06-21T10:30:00Z",
    kind: "alert",
    category: "stop_loss",
    symbol: "TSLA",
    title: "TSLA 손절선 도달",
    body: "TSLA 손절선 도달 (수익률 -10.4%). 리스크 관리를 점검하세요.",
    createdAt: "2026-06-21T10:30:00Z",
    read: false,
  },
  {
    id: "digest:2026-06-21",
    kind: "daily_digest",
    title: "오늘의 추천 (2026-06-21)",
    body: "NVDA, MSFT, AAPL · 기술주 중심으로 반등 흐름이 이어지고 있습니다.",
    createdAt: "2026-06-21T00:05:00Z",
    read: true,
    date: "2026-06-21",
    symbols: ["NVDA", "MSFT", "AAPL"],
  },
  {
    id: "digest:2026-06-20",
    kind: "daily_digest",
    title: "오늘의 추천 (2026-06-20)",
    body: "AVGO, AMD · 반도체 업종 강세.",
    createdAt: "2026-06-20T00:05:00Z",
    read: true,
    date: "2026-06-20",
    symbols: ["AVGO", "AMD"],
  },
];
