import { describe, it, expect, vi } from "vitest";
import { ResendClient, EmailError, type JsonFetcher } from "../resend.js";

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function okFetcher(id = "email_123"): { fetcher: JsonFetcher; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetcher: JsonFetcher = vi.fn(async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ id }) };
  });
  return { fetcher, calls };
}

const MSG = { from: "launch@stock.app", to: "user@example.com", subject: "안녕", text: "본문" };

describe("ResendClient", () => {
  it("is unavailable without an API key", () => {
    expect(new ResendClient({ apiKey: undefined }).isAvailable()).toBe(false);
    expect(new ResendClient({ apiKey: "re_123" }).isAvailable()).toBe(true);
  });

  it("throws when sending without a key", async () => {
    await expect(new ResendClient({ apiKey: undefined }).sendEmail(MSG)).rejects.toBeInstanceOf(EmailError);
  });

  it("requires html or text content", async () => {
    const client = new ResendClient({ apiKey: "re_1", fetcher: okFetcher().fetcher });
    await expect(client.sendEmail({ from: "a@b.c", to: "x@y.z", subject: "s" })).rejects.toThrow(/html or text/);
  });

  it("POSTs to the Resend API with bearer auth and the message body", async () => {
    const { fetcher, calls } = okFetcher("email_abc");
    const client = new ResendClient({ apiKey: "re_secret", fetcher });
    const res = await client.sendEmail(MSG);
    expect(res.id).toBe("email_abc");

    const call = calls[0]!;
    expect(call.url).toBe("https://api.resend.com/emails");
    expect(call.headers["Authorization"]).toBe("Bearer re_secret");
    expect(call.body).toMatchObject({ from: MSG.from, to: MSG.to, subject: MSG.subject, text: MSG.text });
  });

  it("raises EmailError on a non-2xx response", async () => {
    const fetcher: JsonFetcher = vi.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ message: "invalid from" }),
    }));
    const client = new ResendClient({ apiKey: "re_1", fetcher });
    await expect(client.sendEmail(MSG)).rejects.toThrow(/Resend HTTP 422/);
  });
});
