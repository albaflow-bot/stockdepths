/**
 * Shared client config. The API base URL is inlined at build time from
 * EXPO_PUBLIC_API_BASE_URL.
 *
 * IMPORTANT: Expo replaces a *direct* `process.env.EXPO_PUBLIC_*` reference with
 * its literal value during bundling. An aliased or computed access (e.g.
 * `globalThis.process.env["EXPO_PUBLIC_API_BASE_URL"]`) is NOT matched by the
 * inliner, so the value never lands in the release bundle and the app reads empty
 * at runtime. Reference it directly here, then fall back to a runtime global and
 * finally empty (callers degrade gracefully).
 */

// Expo/Metro provide `process.env` in the bundle. @types/node is intentionally
// not in tsconfig `types`, so declare the minimal shape we read.
declare const process: { env: Record<string, string | undefined> };

export function apiBaseUrl(): string {
  const fromBuild = process.env.EXPO_PUBLIC_API_BASE_URL;
  const fromGlobal = (globalThis as { __API_BASE_URL__?: string }).__API_BASE_URL__;
  return (fromBuild ?? fromGlobal ?? "").replace(/\/+$/, "");
}
