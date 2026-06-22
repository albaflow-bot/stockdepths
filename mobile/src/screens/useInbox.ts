import { useCallback, useEffect, useMemo, useState } from "react";
import { NotificationRepository } from "../notifications/repository";
import { addBreadcrumb } from "../resilience/errorLog";
import type { NotificationItem } from "../notifications/types";

export interface UseInboxDeps {
  repository?: NotificationRepository;
}

export interface InboxController {
  status: "loading" | "ready";
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/** Loads the on-device inbox and exposes read-state mutations that persist. */
export function useInbox(deps: UseInboxDeps = {}): InboxController {
  const repo = useMemo(() => deps.repository ?? new NotificationRepository(), [deps.repository]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const loaded = await repo.list();
      if (!active) return;
      setItems(loaded);
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, [repo]);

  const markRead = useCallback(
    async (id: string) => {
      addBreadcrumb(`notification read ${id}`);
      setItems(await repo.markRead(id));
    },
    [repo],
  );

  const markAllRead = useCallback(async () => {
    setItems(await repo.markAllRead());
  }, [repo]);

  const unreadCount = items.filter((i) => !i.read).length;
  return { status, items, unreadCount, markRead, markAllRead };
}
