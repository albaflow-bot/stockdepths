/**
 * FCM HTTP v1 client.
 *
 * Sends notifications via `POST /v1/projects/{projectId}/messages:send`, one token
 * per request (v1 has no native batch; we fan out and aggregate). Tokens that FCM
 * reports as UNREGISTERED / NOT_FOUND are flagged so the caller can prune them.
 * The OAuth token provider and the fetch impl are injectable for deterministic
 * tests. `isAvailable()` is false when no service account is configured, so the
 * rest of the app keeps working without push (RESILIENCE CONTRACT).
 */

import { loadServiceAccount, ServiceAccountTokenProvider } from "./serviceAccount.js";
import type {
  AccessTokenProvider,
  Fetcher,
  MulticastResult,
  PushMessage,
  SendResult,
} from "./types.js";

export interface FcmClientOptions {
  projectId?: string;
  tokenProvider?: AccessTokenProvider;
  fetcher?: Fetcher;
}

const DEFAULT_CHANNEL = "stock_timing";

function isUnregistered(status: number, bodyText: string): boolean {
  if (status === 404) return true;
  return /UNREGISTERED|registration-token-not-registered|NOT_FOUND|InvalidRegistration/i.test(bodyText);
}

export class FcmClient {
  private readonly projectId?: string;
  private readonly tokenProvider?: AccessTokenProvider;
  private readonly fetcher?: Fetcher;

  constructor(opts: FcmClientOptions = {}) {
    this.projectId = opts.projectId;
    this.tokenProvider = opts.tokenProvider;
    this.fetcher = opts.fetcher;
  }

  /** True when a project + token provider are configured. */
  isAvailable(): boolean {
    return Boolean(this.projectId) && Boolean(this.tokenProvider);
  }

  private resolveFetcher(): Fetcher {
    if (this.fetcher) return this.fetcher;
    if (typeof globalThis.fetch === "function") return globalThis.fetch as unknown as Fetcher;
    throw new Error("No fetch implementation available for FCM.");
  }

  async sendToToken(message: PushMessage, token: string): Promise<SendResult> {
    if (!this.isAvailable()) {
      throw new Error("FCM is not configured (missing service account / project id).");
    }
    const accessToken = await this.tokenProvider!.getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;
    const payload = {
      message: {
        token,
        notification: { title: message.title, body: message.body },
        ...(message.data ? { data: message.data } : {}),
        android: {
          priority: "high",
          notification: { channel_id: message.androidChannelId ?? DEFAULT_CHANNEL },
        },
      },
    };

    let res: { ok: boolean; status: number; text(): Promise<string> };
    try {
      res = await this.resolveFetcher()(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return { token, ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (res.ok) return { token, ok: true };
    const bodyText = await res.text().catch(() => "");
    return {
      token,
      ok: false,
      unregistered: isUnregistered(res.status, bodyText),
      error: `HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
    };
  }

  /** Fan out to many tokens; aggregate results and collect invalid tokens. */
  async sendMulticast(message: PushMessage, tokens: string[]): Promise<MulticastResult> {
    const results = await Promise.all(tokens.map((t) => this.sendToToken(message, t)));
    const invalidTokens = results.filter((r) => r.unregistered).map((r) => r.token);
    const successCount = results.filter((r) => r.ok).length;
    return {
      results,
      successCount,
      failureCount: results.length - successCount,
      invalidTokens,
    };
  }
}

/** Build an FcmClient from environment credentials. Unavailable if none present. */
export function makeFcmClient(opts: FcmClientOptions = {}): FcmClient {
  if (opts.projectId && opts.tokenProvider) return new FcmClient(opts);
  const sa = loadServiceAccount();
  if (!sa) return new FcmClient({ fetcher: opts.fetcher }); // unavailable
  return new FcmClient({
    projectId: opts.projectId ?? sa.project_id,
    tokenProvider: opts.tokenProvider ?? new ServiceAccountTokenProvider(sa, { fetcher: opts.fetcher }),
    fetcher: opts.fetcher,
  });
}
