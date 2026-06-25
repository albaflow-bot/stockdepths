/**
 * Daily digest push (run by the scheduler after the daily batch).
 *
 * Usage: npm run push:digest                # today (UTC), all markets
 *        npm run push:digest -- 2026-06-21
 *
 * Loads each market's shared artifact (US + KR) and pushes it to all registered
 * devices. Requires FCM_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS).
 * With no credentials or no registered devices it skips gracefully (no crash).
 */

import { createArtifactStore, createTokenStore } from "../storage/index.js";
import { makeFcmClient } from "../push/fcm.js";
import { sendDailyDigest } from "../push/digest.js";
import type { Market } from "../market/types.js";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const date = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? todayUtc();
  const markets: Market[] = ["US", "KR"];

  const artifactStore = createArtifactStore();
  const tokenStore = createTokenStore();
  await tokenStore.hydrate(); // load registered devices (Supabase when configured)
  const fcm = makeFcmClient();

  for (const market of markets) {
    await artifactStore.hydrate(market, date);
    const artifact = artifactStore.get(market, date);
    if (!artifact) {
      console.log(
        `[push:digest] no artifact for ${market} ${date} — run \`npm run batch:daily -- --market ${market}\` first.`,
      );
      continue;
    }

    const summary = await sendDailyDigest(artifact, { fcm, tokenStore });
    if (summary.skipped) {
      console.log(`[push:digest] ${market} skipped (${summary.reason}) for ${summary.date}.`);
    } else {
      console.log(
        `[push:digest] ${market} ${summary.date}: sent ${summary.sent}/${summary.tokens} · failed ${summary.failed} · pruned ${summary.pruned}`,
      );
    }
  }

  // Persist any token pruning (Supabase) before this short-lived process exits.
  await tokenStore.flush();
}

main().catch((err) => {
  console.error("[push:digest] failed:", err);
  process.exitCode = 1;
});
