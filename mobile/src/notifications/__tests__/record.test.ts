import { describe, it, expect } from "vitest";
import { buildDigestNotification, buildAlertNotification } from "../record";
import { notificationBadge } from "../labels";
import { formatRelativeTime } from "../../time";

describe("buildDigestNotification", () => {
  it("builds a digest item with a per-day idempotent id", () => {
    const n = buildDigestNotification({
      date: "2026-06-21",
      marketContext: "기술주 강세.",
      symbols: ["NVDA", "MSFT"],
      createdAt: "2026-06-21T00:05:00Z",
    });
    expect(n.id).toBe("digest:2026-06-21");
    expect(n.kind).toBe("daily_digest");
    expect(n.title).toBe("오늘의 추천 (2026-06-21)");
    expect(n.body).toContain("NVDA, MSFT");
    expect(n.read).toBe(false);
  });
});

describe("buildAlertNotification", () => {
  it("builds an alert item carrying the one-line contextual note", () => {
    const n = buildAlertNotification({
      symbol: "aapl",
      category: "stop_loss",
      note: "AAPL 손절선 도달 (수익률 -10%). 리스크 관리를 점검하세요.",
      createdAt: "2026-06-21T10:00:00Z",
    });
    expect(n.kind).toBe("alert");
    expect(n.symbol).toBe("AAPL");
    expect(n.title).toBe("AAPL 손절선 도달");
    expect(n.body).toContain("리스크 관리");
  });
});

describe("notificationBadge", () => {
  it("maps digests + alert categories to label + tone", () => {
    expect(notificationBadge({ id: "d", kind: "daily_digest", title: "", body: "", createdAt: "t", read: false })).toEqual({
      label: "오늘의 추천",
      tone: "neutral",
    });
    expect(
      notificationBadge({ id: "a", kind: "alert", category: "target_reached", title: "", body: "", createdAt: "t", read: false }),
    ).toEqual({ label: "목표가 도달", tone: "positive" });
    expect(
      notificationBadge({ id: "a", kind: "alert", category: "stop_loss", title: "", body: "", createdAt: "t", read: false }),
    ).toEqual({ label: "손절선 도달", tone: "negative" });
  });
});

describe("formatRelativeTime", () => {
  const base = Date.parse("2026-06-21T12:00:00Z");
  it("formats recent times in Korean", () => {
    expect(formatRelativeTime("2026-06-21T11:59:40Z", base)).toBe("방금 전");
    expect(formatRelativeTime("2026-06-21T11:30:00Z", base)).toBe("30분 전");
    expect(formatRelativeTime("2026-06-21T09:00:00Z", base)).toBe("3시간 전");
    expect(formatRelativeTime("2026-06-19T12:00:00Z", base)).toBe("2일 전");
  });
  it("falls back to a calendar date for older items", () => {
    expect(formatRelativeTime("2026-06-01T12:00:00Z", base)).toBe("2026-06-01");
  });
});
