# Daily recommendation batch pipeline

**Task 2 — Daily recommendation batch pipeline (single LLM oneshot).**

Server-side batch that runs **once per day**: combine 5-year trend/volatility
analysis with recent-trend analysis, then produce **3–5 actionable picks** with a
one-line rationale and confidence/risk badges via a **single Claude Sonnet 4.6
oneshot** (Gemini fallback on load), amortized as **one shared public artifact**
(SPEC §3.2 / §3.3).

## Flow

```
universe (US tickers)
      │  per ticker, concurrently (Task 1 cached market layer)
      ▼
getHistory(5Y) + getNews(recent)        ← free sources, cached
      │  deterministic, NO per-stock LLM
      ▼
buildTickerFeatures()                    ← 5Y returns, ann. volatility, MDD,
      │   compact numeric summary           SMA50/200 trend, recent momentum
      ▼
ONE Claude Sonnet 4.6 oneshot            ← Gemini fallback on load / on error
      │   prompt-enforced JSON → validate
      ▼
DailyPicksArtifact  (3–5 picks + badges + 시장 코멘트 + 참고 조언 disclaimer)
      │   idempotent per (market, date)
      ▼
ArtifactStore  → served to all users (shared public artifact)
```

Why deterministic features feed the model: sending 5 years of raw candles per
ticker would blow the token budget. The indicators (`features/indicators.ts`) do
the **measuring**; the single LLM call does the **synthesis** — one call/day, cost
amortized across all users (TOKEN/비용 효율 계약).

## Usage

```ts
import { runDailyBatch, resolveUsUniverse } from "./pipeline/index.js";

const artifact = await runDailyBatch({
  market: "US",
  date: "2026-06-21",                  // YYYY-MM-DD (no clock in library code)
  generatedAt: new Date().toISOString(),
  universe: resolveUsUniverse(),
});
// artifact.picks: [{ symbol, rationale, confidence, risk, action? }, ...]
// artifact.marketContext, artifact.disclaimer, artifact.provider, artifact.model
```

CLI (cron/scheduler entry point):

```bash
npm run batch:daily                 # today (UTC), US
npm run batch:daily -- 2026-06-21 --force
```

## Provider chain (SPEC §3.2)

`makePicksGenerator()` builds an ordered provider chain from env:

- **load < threshold (default 0.8):** Anthropic Sonnet 4.6 first, Gemini failover.
- **load ≥ threshold:** Gemini first (shed cost), Anthropic failover.

Either way the other provider is tried if the first errors or returns invalid
JSON. With no provider configured, the run **aborts with a clear message — it never
fabricates picks** (RESILIENCE CONTRACT). Set `SERVER_LOAD` (0..1) to drive the
selection policy.

## Idempotency & the shared artifact

`ArtifactStore` keys artifacts by `(market, date)` (in-memory + best-effort disk
at `<repoRoot>/.bindesk/artifacts/`). A second `runDailyBatch` for the same day
returns the cached artifact instead of calling the model again — this is the
"single oneshot per day, one shared public artifact" guarantee. Pass `force: true`
to regenerate.

> This is the **current** shared artifact. The immutable append-only track record
> that the honest scorecard reads (SPEC §3.3, Task 4) is a separate store.

## Tests

`npm test` — deterministic vitest suite (network and LLM fully stubbed):

- `features/__tests__/indicators.test.ts` — return/volatility/MDD/SMA math.
- `llm/__tests__/validate.test.ts` — JSON extraction (fences, nested braces),
  badge coercion, 3–5 clamp, malformed-pick rejection.
- `llm/__tests__/generator.test.ts` — provider ordering by load, fallback on
  error and on invalid JSON, all-fail and no-provider errors.
- `pipeline/__tests__/dailyBatch.test.ts` — single oneshot, per-symbol resilience,
  per-day idempotency, `force`, and abort-without-fabrication.

## Env keys

`ANTHROPIC_API_KEY` (required — Sonnet 4.6 primary), `GEMINI_API_KEY` (optional
fallback). Model ids, universe, and load are overridable — see `server/.env.example`.
