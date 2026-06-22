import { describe, it, expect, vi } from "vitest";
import { FcmClient } from "../fcm.js";
import type { AccessTokenProvider, Fetcher } from "../types.js";

const tokenProvider: AccessTokenProvider = { getAccessToken: async () => "access-tok" };

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Fetcher that routes by the message token in the request body. */
function routingFetcher(badTokens: string[] = []): { fetcher: Fetcher; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetcher: Fetcher = vi.fn(async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, headers: init.headers, body });
    const tok = body?.message?.token as string;
    if (badTokens.includes(tok)) {
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ name: "projects/p/messages/123" }) };
  });
  return { fetcher, calls };
}

const MESSAGE = { title: "오늘의 추천", body: "AAPL, MSFT", data: { type: "daily_digest" } };

describe("FcmClient", () => {
  it("is unavailable without a project + token provider", () => {
    expect(new FcmClient().isAvailable()).toBe(false);
    expect(new FcmClient({ projectId: "p" }).isAvailable()).toBe(false);
    expect(new FcmClient({ projectId: "p", tokenProvider }).isAvailable()).toBe(true);
  });

  it("throws when sending while unconfigured", async () => {
    await expect(new FcmClient().sendToToken(MESSAGE, "t")).rejects.toThrow(/not configured/);
  });

  it("posts a well-formed v1 message with bearer auth", async () => {
    const { fetcher, calls } = routingFetcher();
    const client = new FcmClient({ projectId: "stock-timing", tokenProvider, fetcher });
    const res = await client.sendToToken(MESSAGE, "device-1");
    expect(res.ok).toBe(true);
    const call = calls[0]!;
    expect(call.url).toBe("https://fcm.googleapis.com/v1/projects/stock-timing/messages:send");
    expect(call.headers["Authorization"]).toBe("Bearer access-tok");
    const msg = (call.body as { message: Record<string, unknown> }).message;
    expect(msg["token"]).toBe("device-1");
    expect(msg["notification"]).toEqual({ title: "오늘의 추천", body: "AAPL, MSFT" });
    expect((msg["android"] as { priority: string }).priority).toBe("high");
  });

  it("flags an unregistered token for pruning", async () => {
    const { fetcher } = routingFetcher(["dead"]);
    const client = new FcmClient({ projectId: "p", tokenProvider, fetcher });
    const res = await client.sendToToken(MESSAGE, "dead");
    expect(res.ok).toBe(false);
    expect(res.unregistered).toBe(true);
  });

  it("aggregates a multicast and collects invalid tokens", async () => {
    const { fetcher } = routingFetcher(["dead"]);
    const client = new FcmClient({ projectId: "p", tokenProvider, fetcher });
    const result = await client.sendMulticast(MESSAGE, ["ok1", "dead", "ok2"]);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.invalidTokens).toEqual(["dead"]);
  });

  it("returns a failed result (not throw) on a network error", async () => {
    const fetcher: Fetcher = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const client = new FcmClient({ projectId: "p", tokenProvider, fetcher });
    const res = await client.sendToToken(MESSAGE, "t");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ECONNRESET");
  });
});
