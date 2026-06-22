/**
 * Live backtest smoke demo (hits real free sources). Not part of CI — the
 * deterministic vitest suite is the grader.
 *
 * Usage: npm run backtest -- AAPL          # vs SPY (S&P500), 5 years
 *        npm run backtest -- AAPL QQQ       # benchmark override
 */

import { getMarketRegistry } from "../market/index.js";
import { Backtester } from "../backtest/backtester.js";

async function main() {
  const symbol = process.argv[2] ?? "AAPL";
  const benchmarkSymbol = process.argv[3] ?? "SPY";
  const us = getMarketRegistry().require("US");
  const bt = new Backtester(us, { benchmarkSymbol });

  console.log(`\n=== 5년 백테스트: ${symbol} (벤치마크 ${benchmarkSymbol}) ===`);
  const r = await bt.backtestSymbol(symbol);
  console.log({
    strategy: r.strategy,
    window: `${r.from} → ${r.to} (${r.dataPoints} bars)`,
    trades: r.trades,
    winRatePct: r.winRatePct,
    avgTradeReturnPct: r.avgTradeReturnPct,
    cumulativeReturnPct: r.cumulativeReturnPct,
    benchmarkReturnPct: r.benchmarkReturnPct,
    excessReturnPct: r.excessReturnPct,
    maxDrawdownPct: r.maxDrawdownPct,
  });
}

main().catch((err) => {
  console.error("backtest demo failed:", err);
  process.exitCode = 1;
});
