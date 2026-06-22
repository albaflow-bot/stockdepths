/**
 * FCM push backbone — types (SPEC Task 5).
 *
 * The server pushes the 9 AM daily digest (top 3–5 picks + market context) to
 * Android via FCM (SPEC §3.3: "FCM for Android delivery"). Per-user holding alerts
 * are NOT pushed from here — those are evaluated on-device (see ../alerts).
 */

/** A registered Android device push token. */
export interface DeviceToken {
  token: string;
  platform: "android" | "ios" | "web";
  /** ISO timestamp the token was (re)registered. */
  registeredAt: string;
}

/** A notification to deliver. `data` values must all be strings (FCM constraint). */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Android notification channel id. Default "stock_timing". */
  androidChannelId?: string;
}

/** Result of one send. `unregistered` means the token is dead and should be pruned. */
export interface SendResult {
  token: string;
  ok: boolean;
  unregistered?: boolean;
  error?: string;
}

/** Aggregate result of a multicast send. */
export interface MulticastResult {
  results: SendResult[];
  successCount: number;
  failureCount: number;
  /** Tokens FCM reported as no longer valid (prune these). */
  invalidTokens: string[];
}

/** Mints OAuth2 access tokens for the FCM HTTP v1 API. */
export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

/** Minimal injectable fetch shape (subset of WHATWG fetch). */
export type Fetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Outcome of a daily-digest push run. */
export interface DigestPushSummary {
  skipped: boolean;
  reason?: string;
  date?: string;
  tokens: number;
  sent: number;
  failed: number;
  pruned: number;
}
