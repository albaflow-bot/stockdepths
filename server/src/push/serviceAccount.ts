/**
 * Google service-account OAuth2 for the FCM HTTP v1 API.
 *
 * Mints a short-lived access token by signing a JWT with the service account's
 * private key (RS256) and exchanging it at Google's token endpoint — the standard,
 * correct FCM v1 auth flow. The fetch + clock are injectable so the provider is
 * unit-testable without network or real Google credentials. The token is cached
 * until shortly before expiry.
 *
 * Credentials are read from the environment only (DB BACKEND 계약: never hard-code):
 * FCM_SERVICE_ACCOUNT_JSON (inline JSON) or GOOGLE_APPLICATION_CREDENTIALS (path).
 * If neither is set, loading returns null and the FCM client is simply unavailable
 * (graceful — RESILIENCE CONTRACT).
 */

import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import type { AccessTokenProvider, Fetcher } from "./types.js";

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

/** Load a service account from env (inline JSON or a credentials file path). */
export function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env["FCM_SERVICE_ACCOUNT_JSON"];
  const path = process.env["GOOGLE_APPLICATION_CREDENTIALS"];
  try {
    if (inline && inline.trim()) {
      return normalize(JSON.parse(inline) as Partial<ServiceAccount>);
    }
    if (path && existsSync(path)) {
      return normalize(JSON.parse(readFileSync(path, "utf8")) as Partial<ServiceAccount>);
    }
  } catch {
    // malformed credentials → treat as unconfigured (graceful)
  }
  return null;
}

function normalize(sa: Partial<ServiceAccount>): ServiceAccount | null {
  if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
  return {
    project_id: sa.project_id,
    client_email: sa.client_email,
    // env-stored keys often have escaped newlines
    private_key: sa.private_key.replace(/\\n/g, "\n"),
    token_uri: sa.token_uri ?? DEFAULT_TOKEN_URI,
  };
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export interface TokenProviderDeps {
  fetcher?: Fetcher;
  /** Injectable clock (epoch ms). Defaults to Date.now. */
  now?: () => number;
}

export class ServiceAccountTokenProvider implements AccessTokenProvider {
  private readonly sa: ServiceAccount;
  private readonly fetcher?: Fetcher;
  private readonly now: () => number;
  private cached?: { token: string; expiresAtMs: number };

  constructor(sa: ServiceAccount, deps: TokenProviderDeps = {}) {
    this.sa = sa;
    this.fetcher = deps.fetcher;
    this.now = deps.now ?? Date.now;
  }

  private resolveFetcher(): Fetcher {
    if (this.fetcher) return this.fetcher;
    if (typeof globalThis.fetch === "function") return globalThis.fetch as unknown as Fetcher;
    throw new Error("No fetch implementation available for the token provider.");
  }

  /** Build a signed JWT assertion (exposed for testing). */
  buildAssertion(): string {
    const iat = Math.floor(this.now() / 1000);
    const exp = iat + 3600;
    const header = { alg: "RS256", typ: "JWT" };
    const claims = {
      iss: this.sa.client_email,
      scope: FCM_SCOPE,
      aud: this.sa.token_uri,
      iat,
      exp,
    };
    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
    const signature = createSign("RSA-SHA256").update(signingInput).end().sign(this.sa.private_key);
    return `${signingInput}.${b64url(signature)}`;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAtMs - 60_000) {
      return this.cached.token;
    }
    const assertion = this.buildAssertion();
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString();

    const res = await this.resolveFetcher()(this.sa.token_uri ?? DEFAULT_TOKEN_URI, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(`OAuth token exchange failed: HTTP ${res.status}`);
    }
    const json = JSON.parse(await res.text()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("OAuth token exchange returned no access_token");

    this.cached = {
      token: json.access_token,
      expiresAtMs: this.now() + (json.expires_in ?? 3600) * 1000,
    };
    return this.cached.token;
  }
}
