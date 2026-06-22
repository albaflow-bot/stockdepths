# Append-only track record + scorecard

**Task 4 — Append-only track-record persistence + scorecard computation.**

Immutably log **every** daily recommendation with its entry context, so realized
returns and hit-rate are **honestly recomputable over arbitrary periods**
(1W/1M/3M/YTD). The scorecard is a **read API that derives** its numbers from this
append-only history — never stored, never regenerated (SPEC §3.3, §3.5).

## Two halves

### 1. Append-only log (`store.ts`, `recorder.ts`)

- `TrackRecordStore` is a **JSONL append-only** file: one immutable entry per line.
  Writes only ever `appendFile` — existing lines are never mutated, rewritten, or
  deleted. That is the integrity guarantee: the past can't be silently rewritten.
- Appends are **idempotent** by `id = market:date:symbol`, so re-running a day's
  batch (which is itself idempotent) can't double-log. Corrupt lines are skipped on
  read (resilience), never crash.
- `recordArtifact()` freezes the **entry context** at record time: the asset's
  close on/before the recommendation date **and** the benchmark's close the same
  day. Realized returns are later recomputed against these frozen prices.
- Wired into the pipeline via `runDailyBatch({ recorder })` — recording runs only
  on fresh generation, after delivery, and never blocks delivery on a log error.

### 2. Scorecard read API (`scorecard.ts`)

`ScorecardService.compute(asOf, periods)` derives, per period, the four SPEC
success metrics (SPEC §추천 성공 지표) — nothing is stored:

| Metric | Meaning |
|---|---|
| **excessReturnPct** (headline) | equal-weight portfolio return − S&P500 (SPY) return |
| winRatePct | % of recommendations with a positive realized return (hit rate) |
| avgTradeReturnPct | mean per-recommendation realized return |
| maxDrawdownPct | drawdown of the equal-weight basket equity curve |

Each recommendation is one equal-weight buy-and-hold-to-`asOf` "trade" (the honest
"actual user profit % vs buy-and-hold baseline", SPEC §3.1). `best`/`worst` are
surfaced so winners **and** losers are visible (SPEC §정직한 성적표). Periods filter
which recommendations are included by entry date (`periodStart` is pure/testable);
realized returns use each entry's **frozen** price vs a fresh `asOf` price.

```
log (immutable)                 read (derived, never stored)
─────────────────              ──────────────────────────────
TrackRecordEntry[]   ──►  ScorecardService.compute(asOf, periods)
  entryPrice (frozen)          per entry: realized = lastPrice/entryPrice − 1
  benchmarkEntryPrice          aggregate: excess, winRate, avg, basket MDD
```

## Usage

```ts
import { TrackRecordStore, makeArtifactRecorder, ScorecardService } from "./track/index.js";
import { getMarketRegistry } from "./market/index.js";

const adapter = getMarketRegistry().require("US");
const store = new TrackRecordStore();

// Log (wired into the daily batch):
await runDailyBatch({ /* ... */, adapter,
  recorder: makeArtifactRecorder(store, { adapter, loggedAt: new Date().toISOString() }),
});

// Read the honest scorecard (derived live):
const scorecard = await new ScorecardService(store, adapter).compute("2026-06-21");
```

CLI:

```bash
npm run batch:daily      # generate + log today's picks (append-only)
npm run scorecard        # derive + print the scorecard from the log
```

## Tests

`npm test` — deterministic vitest suite (network stubbed):

- `track/__tests__/store.test.ts` — idempotent append, sorted/since reads, and the
  append-only file guarantee (prior lines never rewritten across instances; corrupt
  line skipped).
- `track/__tests__/recorder.test.ts` — frozen entry/benchmark prices, idempotency,
  per-pick resilience, and the "no benchmark price → record nothing" guard.
- `track/__tests__/scorecard.test.ts` — realized return / hit rate / benchmark
  excess for ALL, period filtering (1M excludes an older entry), null metrics for an
  empty period, un-evaluated entries when a symbol is unpriceable, empty log, and
  `periodStart` math.

## Honesty note

The scorecard reports the real result. The live smoke run shows a portfolio that
slightly **trailed** SPY (negative excess) over a window — surfaced plainly, not
hidden (SPEC §정직한 성적표).
