/**
 * Daily digest push — builds the 9 AM notification from the shared artifact and
 * sends it to every registered device, pruning dead tokens (SPEC §3.3 dual-tier
 * notifications: tier 1 = daily digest).
 *
 * One server push per day, broadcast to all users (the artifact is the shared
 * public "today's picks"). No per-user computation here — holding alerts are
 * on-device (../alerts).
 */

import type { DailyPicksArtifact } from "../pipeline/artifactStore.js";
import type { FcmClient } from "./fcm.js";
import type { DeviceTokenStore } from "./tokenStore.js";
import type { DigestPushSummary, PushMessage } from "./types.js";

const DIGEST_CHANNEL = "daily_digest";
const MAX_BODY = 230;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Build the digest push message from the day's artifact. */
export function buildDigestMessage(artifact: DailyPicksArtifact): PushMessage {
  const symbols = artifact.picks.map((p) => p.symbol).join(", ");
  const body = truncate(`오늘의 주목 종목: ${symbols} · ${artifact.marketContext}`, MAX_BODY);
  // FCM data values must be strings; ship a compact pick list for the client.
  const compact = artifact.picks.map((p) => ({ s: p.symbol, c: p.confidence, r: p.risk }));
  return {
    title: `오늘의 추천 (${artifact.date})`,
    body,
    androidChannelId: DIGEST_CHANNEL,
    data: {
      type: "daily_digest",
      market: artifact.market,
      date: artifact.date,
      picks: JSON.stringify(compact),
    },
  };
}

export interface SendDailyDigestDeps {
  fcm: FcmClient;
  tokenStore: DeviceTokenStore;
}

/**
 * Send the daily digest to all registered devices. Skips gracefully when FCM is
 * unconfigured or there are no tokens; prunes tokens FCM reports as dead.
 */
export async function sendDailyDigest(
  artifact: DailyPicksArtifact,
  deps: SendDailyDigestDeps,
): Promise<DigestPushSummary> {
  if (!deps.fcm.isAvailable()) {
    return { skipped: true, reason: "FCM not configured", date: artifact.date, tokens: 0, sent: 0, failed: 0, pruned: 0 };
  }
  const tokens = deps.tokenStore.listTokens();
  if (tokens.length === 0) {
    return { skipped: true, reason: "no registered devices", date: artifact.date, tokens: 0, sent: 0, failed: 0, pruned: 0 };
  }

  const message = buildDigestMessage(artifact);
  const result = await deps.fcm.sendMulticast(message, tokens);
  const pruned = result.invalidTokens.length > 0 ? deps.tokenStore.remove(result.invalidTokens) : 0;

  return {
    skipped: false,
    date: artifact.date,
    tokens: tokens.length,
    sent: result.successCount,
    failed: result.failureCount,
    pruned,
  };
}
