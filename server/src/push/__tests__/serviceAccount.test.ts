import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { ServiceAccountTokenProvider, type ServiceAccount } from "../serviceAccount.js";
import type { Fetcher } from "../types.js";

// A throwaway RSA keypair so we can sign + verify without real Google creds.
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const SA: ServiceAccount = {
  project_id: "stock-timing",
  client_email: "fcm@stock-timing.iam.gserviceaccount.com",
  private_key: privateKey,
  token_uri: "https://oauth2.googleapis.com/token",
};

function tokenFetcher(token = "ya29.access-token", expiresIn = 3600): Fetcher {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ access_token: token, expires_in: expiresIn }),
  }));
}

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("ServiceAccountTokenProvider", () => {
  it("builds a valid RS256 JWT assertion signed by the service-account key", () => {
    const now = () => 1_700_000_000_000;
    const provider = new ServiceAccountTokenProvider(SA, { now, fetcher: tokenFetcher() });
    const jwt = provider.buildAssertion();
    const [h, c, sig] = jwt.split(".");
    expect(h && c && sig).toBeTruthy();

    const header = decode(h!);
    const claims = decode(c!);
    expect(header).toMatchObject({ alg: "RS256", typ: "JWT" });
    expect(claims["iss"]).toBe(SA.client_email);
    expect(claims["aud"]).toBe(SA.token_uri);
    expect(claims["scope"]).toContain("firebase.messaging");
    expect(claims["exp"]).toBe(Math.floor(now() / 1000) + 3600);

    const ok = verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig!, "base64url"));
    expect(ok).toBe(true);
  });

  it("exchanges the JWT for an access token", async () => {
    const provider = new ServiceAccountTokenProvider(SA, { fetcher: tokenFetcher("tok-123") });
    expect(await provider.getAccessToken()).toBe("tok-123");
  });

  it("caches the token until shortly before expiry, then refreshes", async () => {
    let t = 1_000_000;
    const fetcher = tokenFetcher("tok", 3600);
    const provider = new ServiceAccountTokenProvider(SA, { fetcher, now: () => t });
    await provider.getAccessToken();
    await provider.getAccessToken(); // still fresh → no new exchange
    expect(fetcher).toHaveBeenCalledTimes(1);
    t += 3600 * 1000; // past expiry
    await provider.getAccessToken();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("throws when the token exchange fails", async () => {
    const fetcher: Fetcher = vi.fn(async () => ({ ok: false, status: 401, text: async () => "denied" }));
    const provider = new ServiceAccountTokenProvider(SA, { fetcher });
    await expect(provider.getAccessToken()).rejects.toThrow(/token exchange failed/);
  });
});
