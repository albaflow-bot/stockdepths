/**
 * Live smoke demo (hits real free sources). Run: `npm run demo:us -- AAPL`.
 * Not part of CI — the deterministic vitest suite is the grader. This just lets
 * a human eyeball that the free feeds still respond.
 */

import { getMarketRegistry } from "../market/index.js";

async function main() {
  const symbol = process.argv[2] ?? "AAPL";
  const us = getMarketRegistry().require("US");

  console.log(`\n=== ${symbol} — latest delayed quote ===`);
  const quote = await us.getQuote(symbol);
  console.log(quote);

  console.log(`\n=== ${symbol} — 5Y history (summary) ===`);
  const hist = await us.getHistory(symbol);
  console.log({
    source: hist.source,
    from: hist.from,
    to: hist.to,
    candles: hist.candles.length,
    firstClose: hist.candles[0]?.close,
    lastClose: hist.candles[hist.candles.length - 1]?.close,
  });

  console.log(`\n=== ${symbol} — news / disclosures (top 5) ===`);
  const news = await us.getNews(symbol, { limit: 5 });
  for (const n of news) {
    console.log(`- [${n.kind}/${n.source}] ${n.publishedAt.slice(0, 10)}  ${n.title}`);
  }
}

main().catch((err) => {
  console.error("demo failed:", err);
  process.exitCode = 1;
});
