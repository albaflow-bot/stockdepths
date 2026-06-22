/**
 * Resend email client (SPEC Task 13 — transactional/announcement email).
 *
 * The Resend API key is a secret and is read from the environment ONLY, server
 * side (TOKEN/비용 효율 + DB BACKEND 계약: never expose keys to the client). The
 * fetch implementation is injectable for deterministic tests. When the key is
 * absent the client reports unavailable and sends are skipped gracefully rather
 * than crashing (RESILIENCE CONTRACT).
 */

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailError";
  }
}

/** Minimal injectable fetch shape (subset of WHATWG fetch). */
export type JsonFetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface EmailMessage {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

export interface SendResult {
  id: string;
}

export interface ResendClientOptions {
  apiKey?: string;
  fetcher?: JsonFetcher;
}

const ENDPOINT = "https://api.resend.com/emails";

export class ResendClient {
  private readonly apiKey?: string;
  private readonly fetcher?: JsonFetcher;

  constructor(opts: ResendClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env["RESEND_API_KEY"];
    this.fetcher = opts.fetcher;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private resolveFetcher(): JsonFetcher {
    if (this.fetcher) return this.fetcher;
    if (typeof globalThis.fetch === "function") return globalThis.fetch as unknown as JsonFetcher;
    throw new EmailError("No fetch implementation available for Resend.");
  }

  async sendEmail(message: EmailMessage): Promise<SendResult> {
    if (!this.apiKey) {
      throw new EmailError("RESEND_API_KEY is not set; email sending is unavailable.");
    }
    if (!message.html && !message.text) {
      throw new EmailError("email must include html or text content.");
    }

    const res = await this.resolveFetcher()(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.text ? { text: message.text } : {}),
      }),
    });

    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      throw new EmailError(`Resend HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`);
    }
    const parsed = bodyText ? (JSON.parse(bodyText) as { id?: string }) : {};
    return { id: parsed.id ?? "" };
  }
}

/** Build a ResendClient from environment configuration. */
export function makeResendClient(opts: ResendClientOptions = {}): ResendClient {
  return new ResendClient(opts);
}
