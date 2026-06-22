/**
 * Send the launch announcement email (Resend).
 *
 * Usage: npm run email:announce -- you@example.com [https://app-url]
 *
 * Requires RESEND_API_KEY and EMAIL_FROM. Without them it skips gracefully with a
 * clear message instead of failing.
 */

import { makeResendClient } from "../email/resend.js";
import { sendLaunchAnnouncement } from "../email/announcement.js";

async function main() {
  const args = process.argv.slice(2);
  const to = args.find((a) => a.includes("@"));
  const appUrl = args.find((a) => /^https?:\/\//.test(a)) ?? "https://stock-timing.example.com/";
  const from = process.env["EMAIL_FROM"];

  if (!to) {
    console.error("[email:announce] usage: npm run email:announce -- you@example.com [https://app-url]");
    process.exitCode = 1;
    return;
  }

  const client = makeResendClient();
  if (!client.isAvailable() || !from) {
    console.log(
      "[email:announce] skipped — set RESEND_API_KEY and EMAIL_FROM to send. " +
        `(would announce to ${to} with CTA ${appUrl})`,
    );
    return;
  }

  const result = await sendLaunchAnnouncement(client, { to, from, appUrl });
  console.log(`[email:announce] sent to ${to} (id: ${result.id || "n/a"})`);
}

main().catch((err) => {
  console.error("[email:announce] failed:", err);
  process.exitCode = 1;
});
