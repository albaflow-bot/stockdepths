/**
 * Notification opt-in preference (local). Drives the inbox's alert opt-in
 * affordance and the `alert_opt_in` funnel event (SPEC Task 13).
 */

import type { AsyncKeyValueStorage } from "../data/storage";
import { defaultStorage } from "../data/storage";

const KEY = "bindesk:notif-optin";

export interface NotificationPrefsDeps {
  storage?: AsyncKeyValueStorage;
}

export class NotificationPrefsRepository {
  private readonly storage: AsyncKeyValueStorage;

  constructor(deps: NotificationPrefsDeps = {}) {
    this.storage = deps.storage ?? defaultStorage();
  }

  async isOptedIn(): Promise<boolean> {
    try {
      return (await this.storage.getItem(KEY)) === "1";
    } catch {
      return false;
    }
  }

  async setOptedIn(value: boolean): Promise<void> {
    try {
      await this.storage.setItem(KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
}
