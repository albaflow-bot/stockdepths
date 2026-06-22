/**
 * On-device rule-engine demo (uses live delayed quotes for illustration).
 *
 * Usage: npm run alerts:demo
 *
 * Shows the deterministic engine the client runs on-device: it evaluates sample
 * holdings against the latest quotes and prints the one-line contextual notes. No
 * LLM, no server round-trip for the alert itself.
 */

import { getMarketRegistry } from "../market/index.js";
import { evaluateHoldings } from "../alerts/ruleEngine.js";
import type { Holding, QuoteLike } from "../alerts/types.js";

async function main() {
  const us = getMarketRegistry().require("US");

  // Sample on-device portfolio (cost basis the user entered locally).
  const holdings: Holding[] = [
    { symbol: "AAPL", costBasis: 150, targetReturnPct: 20, stopLossPct: 10 },
    { symbol: "MSFT", costBasis: 480, targetReturnPct: 15, stopLossPct: 8 },
    { symbol: "NVDA", costBasis: 100, targetReturnPct: 30, stopLossPct: 15 },
  ];

  const quotes: QuoteLike[] = [];
  for (const h of holdings) {
    try {
      const q = await us.getQuote(h.symbol);
      quotes.push({ symbol: q.symbol, price: q.price, changePercent: q.changePercent, asOf: q.asOf });
    } catch {
      // skip symbols whose quote is unavailable
    }
  }

  console.log("\n=== 보유 종목 알림 (on-device 규칙 엔진, 성향: 중립형) ===");
  const alerts = evaluateHoldings(holdings, quotes, { profile: "neutral" });
  if (alerts.length === 0) {
    console.log("현재 목표가·손절선 임계에 도달하거나 근접한 종목이 없습니다.");
  }
  for (const a of alerts) {
    console.log(`[${a.severity}/${a.kind}] ${a.note}`);
  }
  console.log("\n(참고용 알림입니다. 투자 판단과 책임은 본인에게 있습니다.)");
}

main().catch((err) => {
  console.error("alerts demo failed:", err);
  process.exitCode = 1;
});
