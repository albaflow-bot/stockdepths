/**
 * 9 AM daily digest push (run by cron after the daily batch).
 *
 * Usage: npm run push:digest                # today (UTC), US
 *        npm run push:digest -- 2026-06-21
 *
 * Loads the day's shared artifact and pushes it to all registered devices.
 * Requires FCM_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS). With no
 * credentials or no registered devices it skips gracefully (no crash).
 */

import { ArtifactStore } from "../pipeline/artifactStore.js";
import { makeFcmClient } from "../push/fcm.js";
import { DeviceTokenStore } from "../push/tokenStore.js";
import { sendDailyDigest } from "../push/digest.js";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const date = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? todayUtc();
  const artifact = new ArtifactStore().get("US", date);
  if (!artifact) {
    console.log(`[push:digest] no artifact for US ${date} — run \`npm run batch:daily\` first.`);
    return;
  }

  const summary = await sendDailyDigest(artifact, {
    fcm: makeFcmClient(),
    tokenStore: new DeviceTokenStore(),
  });

  if (summary.skipped) {
    console.log(`[push:digest] skipped (${summary.reason}) for ${summary.date}.`);
    return;
  }
  console.log(
    `[push:digest] ${summary.date}: sent ${summary.sent}/${summary.tokens} · failed ${summary.failed} · pruned ${summary.pruned}`,
  );
}

main().catch((err) => {
  console.error("[push:digest] failed:", err);
  process.exitCode = 1;
});
