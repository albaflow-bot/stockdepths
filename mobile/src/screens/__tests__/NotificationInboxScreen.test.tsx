import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationInboxScreen } from "../NotificationInboxScreen";
import { NotificationRepository } from "../../notifications/repository";
import { createMemoryStorage } from "../../data/storage";
import { SAMPLE_NOTIFICATIONS } from "../../data/sampleNotifications";

const NOW = Date.parse("2026-06-21T14:00:00Z");

async function seededRepo() {
  const repo = new NotificationRepository({ storage: createMemoryStorage() });
  // add oldest→newest so the list ends up newest-first
  for (const n of [...SAMPLE_NOTIFICATIONS].reverse()) await repo.add(n);
  return repo;
}

describe("NotificationInboxScreen", () => {
  it("lists both daily digests and event-driven alerts with their advice", async () => {
    render(<NotificationInboxScreen repository={await seededRepo()} nowMs={NOW} />);
    await waitFor(() => expect(screen.getByTestId("inbox-screen")).toBeInTheDocument());

    expect(screen.getByText("NVDA 목표가 도달")).toBeInTheDocument();
    expect(screen.getByText("TSLA 손절선 도달")).toBeInTheDocument();
    expect(screen.getByText("오늘의 추천 (2026-06-21)")).toBeInTheDocument();
    // one-line contextual advice is shown
    expect(screen.getByText(/분할 매도를 검토하세요/)).toBeInTheDocument();
    // type badges
    expect(screen.getByText("목표가 도달")).toBeInTheDocument();
    expect(screen.getByText("손절선 도달")).toBeInTheDocument();
  });

  it("filters by type (추천 vs 알림)", async () => {
    render(<NotificationInboxScreen repository={await seededRepo()} nowMs={NOW} />);
    await waitFor(() => expect(screen.getByTestId("inbox-screen")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("inbox-filter-alert"));
    expect(screen.getByText("NVDA 목표가 도달")).toBeInTheDocument();
    expect(screen.queryByText("오늘의 추천 (2026-06-21)")).toBeNull();

    fireEvent.click(screen.getByTestId("inbox-filter-daily_digest"));
    expect(screen.getByText("오늘의 추천 (2026-06-21)")).toBeInTheDocument();
    expect(screen.queryByText("NVDA 목표가 도달")).toBeNull();
  });

  it("marks an item read on tap and marks all read", async () => {
    render(<NotificationInboxScreen repository={await seededRepo()} nowMs={NOW} />);
    await waitFor(() => expect(screen.getByTestId("inbox-screen")).toBeInTheDocument());

    // 2 unread initially (NVDA + TSLA alerts) → mark-all shows count.
    expect(screen.getByTestId("mark-all-read")).toHaveTextContent("모두 읽음 (2)");

    fireEvent.click(screen.getByTestId("notification-alert:NVDA:target_reached:2026-06-21T13:05:00Z"));
    await waitFor(() =>
      expect(screen.queryByTestId("unread-dot-alert:NVDA:target_reached:2026-06-21T13:05:00Z")).toBeNull(),
    );
    expect(screen.getByTestId("mark-all-read")).toHaveTextContent("모두 읽음 (1)");

    fireEvent.click(screen.getByTestId("mark-all-read"));
    await waitFor(() => expect(screen.queryByTestId("mark-all-read")).toBeNull());
  });

  it("shows an empty state when there are no notifications", async () => {
    const repo = new NotificationRepository({ storage: createMemoryStorage() });
    render(<NotificationInboxScreen repository={repo} nowMs={NOW} />);
    await waitFor(() => expect(screen.getByTestId("inbox-empty")).toBeInTheDocument());
  });

  it("shows an empty state for a filter with no matching items", async () => {
    const repo = new NotificationRepository({ storage: createMemoryStorage() });
    await repo.add(SAMPLE_NOTIFICATIONS[2]!); // a digest only
    render(<NotificationInboxScreen repository={repo} nowMs={NOW} />);
    await waitFor(() => expect(screen.getByTestId("inbox-screen")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("inbox-filter-alert"));
    expect(screen.getByTestId("inbox-empty")).toBeInTheDocument();
  });
});
