import { describe, it, expect } from "vitest";
import { buildDigestMessage, sendDailyDigest } from "../digest.js";
import { FcmClient } from "../fcm.js";
import { DeviceTokenStore } from "../tokenStore.js";
import type { AccessTokenProvider, Fetcher } from "../types.js";
import type { DailyPicksArtifact } from "../../pipeline/artifactStore.js";

const ARTIFACT: DailyPicksArtifact = {
  market: "US",
  date: "2026-06-21",
  generatedAt: "2026-06-21T13:00:00Z",
  marketContext: "전반적으로 견조한 흐름.",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  disclaimer: "참고 조언",
  universe: ["AAPL", "MSFT", "NVDA"],
  picks: [
    { symbol: "AAPL", rationale: "추세", confidence: "high", risk: "low" },
    { symbol: "MSFT", rationale: "모멘텀", confidence: "medium", risk: "medium" },
    { symbol: "NVDA", rationale: "성장", confidence: "high", risk: "high" },
  ],
};

const tokenProvider: AccessTokenProvider = { getAccessToken: async () => "t" };

function routingFetcher(badTokens: string[] = []): Fetcher {
  return async (_url, init) => {
    const tok = init.body ? (JSON.parse(init.body).message.token as string) : "";
    if (badTokens.includes(tok)) {
      return { ok: false, status: 404, text: async () => "UNREGISTERED" };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };
}

describe("buildDigestMessage", () => {
  it("builds the title, body, and string-only data payload", () => {
    const m = buildDigestMessage(ARTIFACT);
    expect(m.title).toBe("오늘의 추천 (2026-06-21)");
    expect(m.body).toContain("AAPL, MSFT, NVDA");
    expect(m.body).toContain("견조");
    expect(m.androidChannelId).toBe("daily_digest");
    expect(m.data!["type"]).toBe("daily_digest");
    expect(m.data!["date"]).toBe("2026-06-21");
    const picks = JSON.parse(m.data!["picks"]!) as Array<{ s: string }>;
    expect(picks.map((p) => p.s)).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("truncates an overly long body", () => {
    const long = { ...ARTIFACT, marketContext: "가".repeat(500) };
    expect(buildDigestMessage(long).body.length).toBeLessThanOrEqual(231);
  });
});

describe("sendDailyDigest", () => {
  it("sends to all devices and prunes the ones FCM rejects", async () => {
    const fcm = new FcmClient({ projectId: "p", tokenProvider, fetcher: routingFetcher(["dead"]) });
    const tokenStore = new DeviceTokenStore({ file: null });
    tokenStore.register("ok1", "android", "t");
    tokenStore.register("dead", "android", "t");
    tokenStore.register("ok2", "android", "t");

    const summary = await sendDailyDigest(ARTIFACT, { fcm, tokenStore });
    expect(summary.skipped).toBe(false);
    expect(summary.tokens).toBe(3);
    expect(summary.sent).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.pruned).toBe(1);
    expect(tokenStore.listTokens().sort()).toEqual(["ok1", "ok2"]); // dead pruned
  });

  it("skips gracefully when FCM is not configured", async () => {
    const tokenStore = new DeviceTokenStore({ file: null });
    tokenStore.register("ok1", "android", "t");
    const summary = await sendDailyDigest(ARTIFACT, { fcm: new FcmClient(), tokenStore });
    expect(summary.skipped).toBe(true);
    expect(summary.reason).toMatch(/not configured/);
  });

  it("skips gracefully when there are no registered devices", async () => {
    const fcm = new FcmClient({ projectId: "p", tokenProvider, fetcher: routingFetcher() });
    const summary = await sendDailyDigest(ARTIFACT, { fcm, tokenStore: new DeviceTokenStore({ file: null }) });
    expect(summary.skipped).toBe(true);
    expect(summary.reason).toMatch(/no registered/);
  });
});
