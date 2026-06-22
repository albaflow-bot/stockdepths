# FCM push backbone

**Task 5 (server half) — FCM for Android delivery + the 9 AM daily digest.**

The server pushes the **daily digest** (top 3–5 picks + market context) to Android
via FCM once a day (SPEC §3.3 dual-tier notifications, tier 1). Per-user holding
alerts are **not** pushed from here — those are on-device (see `../alerts`).

## Pieces

| File | Role |
|---|---|
| `serviceAccount.ts` | Google service-account OAuth2 — signs an RS256 JWT and exchanges it for an FCM access token (the correct HTTP v1 auth flow). Fetch + clock injectable. |
| `fcm.ts` | `FcmClient` — `POST /v1/projects/{id}/messages:send`, fans out a multicast, flags UNREGISTERED tokens for pruning. `isAvailable()` gates everything. |
| `tokenStore.ts` | `DeviceTokenStore` — mutable device-token registry (register / remove / list), file + memory. |
| `digest.ts` | `buildDigestMessage(artifact)` + `sendDailyDigest(...)` — build the notification from the shared artifact and broadcast it, pruning dead tokens. |

## Flow

```
9 AM cron → daily batch (Task 2) produces the shared artifact
          → sendDailyDigest(artifact, { fcm, tokenStore })
              fcm.sendMulticast(message, allTokens)   # one push per token (v1)
              prune tokens FCM reports UNREGISTERED
```

## Config (env only — never hard-coded)

FCM credentials come from the environment (DB BACKEND 계약):

- `FCM_SERVICE_ACCOUNT_JSON` — the service-account JSON inline, **or**
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the service-account JSON file.

With neither set, `FcmClient.isAvailable()` is false and `sendDailyDigest` **skips
gracefully** — the rest of the app runs without push (RESILIENCE CONTRACT). The
project id is read from the service account (`project_id`).

## Usage

```ts
import { makeFcmClient, DeviceTokenStore, sendDailyDigest } from "./push/index.js";
import { ArtifactStore } from "./pipeline/index.js";

const artifact = new ArtifactStore().get("US", "2026-06-21")!;
const summary = await sendDailyDigest(artifact, {
  fcm: makeFcmClient(),
  tokenStore: new DeviceTokenStore(),
});
// { skipped, sent, failed, pruned, tokens, date }
```

Run the 9 AM push (cron entry point, after the batch): `npm run push:digest`.

## Tests

`npm test` (network + Google creds fully stubbed):

- `push/__tests__/serviceAccount.test.ts` — RS256 JWT built + verified with a
  generated keypair, token exchange, expiry caching/refresh, exchange-failure.
- `push/__tests__/fcm.test.ts` — availability gate, well-formed v1 payload + bearer
  auth, UNREGISTERED → prune flag, multicast aggregation, network-error handling.
- `push/__tests__/tokenStore.test.ts` — register/dedupe/refresh, remove, file
  persistence of registrations and removals.
- `push/__tests__/digest.test.ts` — message build (title/body/string-data, body
  truncation), send + prune, and the two graceful-skip paths (no FCM, no devices).
