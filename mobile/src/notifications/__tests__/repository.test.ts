import { describe, it, expect } from "vitest";
import { NotificationRepository } from "../repository";
import { buildAlertNotification, buildDigestNotification } from "../record";
import { createMemoryStorage } from "../../data/storage";

const digest = (date: string, createdAt: string) =>
  buildDigestNotification({ date, marketContext: "x", symbols: ["AAPL"], createdAt });

describe("NotificationRepository", () => {
  it("adds items newest-first and dedupes by id", async () => {
    const repo = new NotificationRepository({ storage: createMemoryStorage() });
    await repo.add(digest("2026-06-20", "2026-06-20T00:05:00Z"));
    await repo.add(digest("2026-06-21", "2026-06-21T00:05:00Z"));
    await repo.add(digest("2026-06-21", "2026-06-21T00:05:00Z")); // dup id

    const list = await repo.list();
    expect(list.map((i) => i.date)).toEqual(["2026-06-21", "2026-06-20"]); // newest first
  });

  it("tracks unread and marks items read", async () => {
    const repo = new NotificationRepository({ storage: createMemoryStorage() });
    const a = buildAlertNotification({ symbol: "AAPL", category: "target_reached", note: "n", createdAt: "2026-06-21T10:00:00Z" });
    const b = buildAlertNotification({ symbol: "MSFT", category: "stop_loss", note: "n", createdAt: "2026-06-21T11:00:00Z" });
    await repo.add(a);
    await repo.add(b);
    expect(await repo.unreadCount()).toBe(2);

    await repo.markRead(a.id);
    expect(await repo.unreadCount()).toBe(1);

    await repo.markAllRead();
    expect(await repo.unreadCount()).toBe(0);
  });

  it("persists across instances and recovers from a corrupt store", async () => {
    const storage = createMemoryStorage();
    const r1 = new NotificationRepository({ storage });
    await r1.add(digest("2026-06-21", "2026-06-21T00:05:00Z"));
    expect((await new NotificationRepository({ storage }).list())).toHaveLength(1);

    await storage.setItem("bindesk:notifications", "not json");
    expect(await new NotificationRepository({ storage }).list()).toEqual([]);
  });
});
