/**
 * Notification inbox repository — stores received digests + fired alerts on-device
 * only (no login). Append is idempotent by id (a digest re-delivery or repeated
 * alert won't duplicate). Bounded ring keeps the most recent items.
 */

import type { AsyncKeyValueStorage } from "../data/storage";
import { defaultStorage } from "../data/storage";
import type { NotificationItem } from "./types";

const STORAGE_KEY = "bindesk:notifications";
const MAX_ITEMS = 200;

function sortDesc(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
}

export interface NotificationRepositoryDeps {
  storage?: AsyncKeyValueStorage;
}

export class NotificationRepository {
  private readonly storage: AsyncKeyValueStorage;

  constructor(deps: NotificationRepositoryDeps = {}) {
    this.storage = deps.storage ?? defaultStorage();
  }

  async list(): Promise<NotificationItem[]> {
    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as NotificationItem[];
      return Array.isArray(parsed) ? sortDesc(parsed) : [];
    } catch {
      return [];
    }
  }

  private async save(items: NotificationItem[]): Promise<NotificationItem[]> {
    const capped = sortDesc(items).slice(0, MAX_ITEMS);
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(capped));
    return capped;
  }

  /** Append an item; no-op if its id already exists (idempotent). */
  async add(item: NotificationItem): Promise<NotificationItem[]> {
    const items = await this.list();
    if (items.some((i) => i.id === item.id)) return items;
    return this.save([item, ...items]);
  }

  async markRead(id: string): Promise<NotificationItem[]> {
    const items = await this.list();
    return this.save(items.map((i) => (i.id === id ? { ...i, read: true } : i)));
  }

  async markAllRead(): Promise<NotificationItem[]> {
    const items = await this.list();
    return this.save(items.map((i) => (i.read ? i : { ...i, read: true })));
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(STORAGE_KEY);
  }

  async unreadCount(): Promise<number> {
    return (await this.list()).filter((i) => !i.read).length;
  }
}
