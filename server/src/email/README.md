# Transactional / announcement email (Resend)

**Task 13 (server half) — email integration.**

Sends email via [Resend](https://resend.com). The API key is a **secret read from
the environment only, server-side** — never exposed to the client.

## Pieces

| File | Role |
|---|---|
| `resend.ts` | `ResendClient` — `POST https://api.resend.com/emails` with bearer auth; injectable fetch; `isAvailable()` gates sends; `EmailError` on failure. |
| `announcement.ts` | `buildLaunchAnnouncement()` (Korean copy leading with the honest-scorecard + 5Y-backtest trust angle, free/no-login, with the '참고 조언' disclaimer) + `sendLaunchAnnouncement()`. |

## Usage

```ts
import { makeResendClient, sendLaunchAnnouncement } from "./email/index.js";

const client = makeResendClient(); // reads RESEND_API_KEY
if (client.isAvailable()) {
  await sendLaunchAnnouncement(client, {
    to: "user@example.com",
    from: process.env.EMAIL_FROM!,
    appUrl: "https://stock-timing.example.com/",
  });
}
```

CLI:

```bash
npm run email:announce -- you@example.com https://stock-timing.example.com/
```

With no `RESEND_API_KEY` / `EMAIL_FROM`, the script skips gracefully with a clear
message rather than failing (RESILIENCE CONTRACT).

## Env keys

`RESEND_API_KEY` (secret) and `EMAIL_FROM` (verified sender) — see
`server/.env.example`.

## Tests

`npm test`:
- `email/__tests__/resend.test.ts` — availability gate, bearer auth + request body,
  html-or-text requirement, non-2xx → `EmailError`.
- `email/__tests__/announcement.test.ts` — template content (trust angle, CTA URL,
  disclaimer, custom product name) and the build+send orchestration.
