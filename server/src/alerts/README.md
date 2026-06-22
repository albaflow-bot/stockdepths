# On-device alert rule engine

**Task 5 (on-device half) — deterministic holdings rule engine.**

Evaluates a user's holdings against their **target-price / stop-loss** thresholds
using the latest (cached, delayed) quote, and emits a **one-line contextual
buy/sell note** — entirely deterministic, **no per-user LLM** (SPEC Task 5).

## Why on-device

Per SPEC §3.2, holdings (cost basis) are stored **on-device only, no login** — the
server never sees a user's portfolio. So these alerts must be computed on-device.
This module is therefore **pure, portable TypeScript with zero Node/runtime
dependencies**, so the Expo / React Native client imports it unchanged.

## What it emits

| Kind | Severity | When |
|---|---|---|
| `target_reached` | action | price ≥ target |
| `stop_loss` | action | price ≤ stop |
| `approaching_target` | info | within `nearThresholdPct` of the target |
| `approaching_stop` | info | within `nearThresholdPct` of the stop |

Thresholds resolve from (most specific first): absolute `targetPrice`/`stopLossPrice`
→ `targetReturnPct`/`stopLossPct` → persona defaults → 20%/10%. Persona defaults
(SPEC §3.2): conservative 10%/5%, neutral 20%/10%, aggressive 40%/20%. The note is
Korean and contextual (includes today's % change when the quote carries it).

## Usage (on-device)

```ts
import { evaluateHoldings } from "./alerts/index.js";

const alerts = evaluateHoldings(
  [{ symbol: "AAPL", costBasis: 150, targetReturnPct: 20, stopLossPct: 10 }],
  [{ symbol: "AAPL", price: 298, changePercent: 0.7 }],
  { profile: "neutral", nearThresholdPct: 2 },
);
// alerts[0].note → "AAPL 목표가 도달 (수익률 +98.67%). 흐름을 고려해 분할 매도를 검토하세요. (오늘 +0.7%)"
```

The device schedules a **local** notification from each alert's `note` — no server
round-trip for the alert itself. The server's only push is the daily digest (../push).

Demo against live quotes: `npm run alerts:demo`.

## Tests

`npm test` — `alerts/__tests__/ruleEngine.test.ts`: threshold resolution
(persona/override/absolute precedence), each alert kind, the neutral zone, persona
shifting the trigger point, `nearThresholdPct=0` disabling approaching alerts,
today's-change in the note, invalid cost basis, portfolio evaluation with
action-first ordering, array vs map quotes, and missing-quote skipping.
