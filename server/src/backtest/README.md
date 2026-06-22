# Automatic backtesting engine

**Task 3 — Automatic backtesting engine.**

For each daily pick, automatically backtest the **same deterministic strategy**
over the prior **5 years before delivery**, and report the four honest metrics the
SPEC requires (SPEC §추천 성공 지표 제안):

- **benchmark-relative cumulative excess return** (vs S&P 500 / SPY) — the headline
- **win rate**
- **per-trade average return**
- **max drawdown (MDD)**

Results feed both the **recommendation card** ('5년 백테스트 결과' panel) and the
**honest scorecard** — from one computation.

## Why a deterministic strategy

The pick *selection* is an LLM synthesis (Task 2): not deterministic, not cheap to
replay. So the backtest runs an explainable rule that mirrors the app's two-axis
thesis (SPEC §장기 추세 × 최근 동향) — a long-only **trend/momentum filter**: hold
only while price ≥ 200-day SMA (long-term uptrend) **and** price ≥ 50-day SMA
(recent strength); otherwise cash. What sits next to each pick is a reproducible
"이 로직은 지난 5년이면 이랬다" (SPEC §핵심 차별점), not a replayed black box.

## How it works

```
runBacktest(assetCandles, benchmarkCandles, {symbol, benchmarkSymbol, strategy})
  1. align asset ∩ benchmark by date (same NYSE calendar)
  2. signal[t] from strategy (uses only data ≤ t — no lookahead)
  3. position[t] = signal[t-1]   (act on the prior close)
  4. equity *= 1 + position[t] * dailyReturn[t]   (cash days = ×1.0)
  5. trades = maximal holding runs → win rate, avg per-trade return
  6. benchmark buy&hold over the same window → excess = strategy − benchmark
  7. MDD from the strategy equity curve
```

- **No lookahead** by construction (yesterday's signal drives today's return).
- **S&P 500 benchmark = SPY** — a free, keyless ticker the Task-1 US adapter fetches
  directly (indices like `^GSPC` need special symbol handling; the ETF does not).
- Pure functions only — `engine.ts` is fully deterministic and unit-tested.

## Usage

```ts
import { Backtester } from "./backtest/index.js";
import { getMarketRegistry } from "./market/index.js";

const bt = new Backtester(getMarketRegistry().require("US")); // benchmark SPY, 5Y
const result = await bt.backtestSymbol("AAPL");
// { excessReturnPct, winRatePct, avgTradeReturnPct, maxDrawdownPct, ... }
```

In the pipeline, every pick is backtested before delivery and the result is
attached as `pick.backtest` (resilient: a single backtest failure omits that
panel but never blocks the pick). Skip with `runDailyBatch({ backtester: null })`.

CLI smoke demo (live free sources, not CI):

```bash
npm run backtest -- AAPL        # vs SPY, 5 years
npm run backtest -- AAPL QQQ    # benchmark override
```

## Tests

`npm test` — deterministic vitest suite (synthetic candles, stubbed adapter):

- `backtest/__tests__/engine.test.ts` — uptrend → 1 winning trade + positive
  excess; downtrend → 0 trades, 0% (cash), negative excess; rising-benchmark excess
  math; date-intersection alignment; choppy multi-trade win rate; insufficient-data
  error; rolling SMA.
- `backtest/__tests__/backtester.test.ts` — asset+benchmark fetch, benchmark
  memoized once across symbols, fetch-error propagation.
- `pipeline/__tests__/dailyBatch.test.ts` — backtest attached to every pick,
  per-pick resilience (failed backtest omitted, pick still delivered), `null` skip.

## Honesty note

The strategy can — and on the live demo for AAPL does — **underperform**
buy-and-hold over a given window (negative excess). That is the point: the engine
reports the real result, not a flattering one (SPEC §정직한 성적표).
