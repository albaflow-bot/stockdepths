# Market data ingestion layer

Pluggable per-market source adapters behind a **common quote/news interface**
(SPEC §3.3, Software Architect). Downstream pick/alert logic imports from
`./index.ts` only and never names a concrete source, so a free API or crawler can
be swapped per market without touching downstream code.

This is **Task 1 — US market data ingestion adapter (free quotes + 5Y history)**.
Korea (KOSPI/KOSDAQ) is an intentional fast-follow once its free-data path is
verified (SPEC §우선순위), and slots into the same `MarketRegistry`.

## What it provides

| Capability | Method | Default |
|---|---|---|
| Latest delayed quote | `getQuote(symbol)` | derived from last 2 daily candles, `delayed: true` |
| Historical daily candles | `getHistory(symbol, { years })` | **5 years**, ascending |
| News + verified disclosures | `getNews(symbol?, { limit })` | newest-first, de-duped |

All three return **normalized, cached** models (`Quote` / `HistoricalSeries` /
`NewsItem[]`). See `types.ts` for the shapes.

## US sources (all free / keyless)

- **Quotes + 5Y candles** — [Stooq](https://stooq.com) daily CSV (primary).
  Automatic fallback to **Yahoo Finance** v8 chart JSON when Stooq is empty or
  blocked. No API key, no quota.
- **News / disclosures** — no free per-symbol news API exists, so we crawl feeds
  (SPEC §3.3 "필요하다면 크롤링이라도"):
  - **Yahoo Finance headline RSS** per ticker (general news).
  - **SEC EDGAR** 8-K Atom feed (verified material-event disclosures) — feeds the
    "검증된 뉴스·공시 기반, 찌라시 제외" requirement (SPEC §3.2).

Every method walks a primary → fallback chain and only raises
`MarketDataError` (aggregating each source's failure) when **all** sources fail.

## Caching & resilience

- `CachedMarketSource` memoizes by `(market, op, symbol, …)` with per-kind TTLs
  (quote 15 min, history 12 h, news 30 min). This is the "cached quote/news model
  downstream logic reads" (SPEC §3.3) and satisfies the TOKEN/비용 효율 계약
  (no repeated fetch of the same key).
- **Stale-on-error**: if every live source fails, the last cached value is served
  so a transient free-feed outage never breaks the daily batch
  (RESILIENCE CONTRACT).
- Warm disk cache at `<repoRoot>/.bindesk/cache/`; all disk failures are
  swallowed (Sane default + override). Disable with `cache: { dir: null }`.

## Usage

```ts
import { getMarketRegistry } from "./market/index.js";

const us = getMarketRegistry().require("US");
const picks5y = await us.getHistory("AAPL");        // 5 years of daily candles
const quote   = await us.getQuote("AAPL");          // latest delayed quote
const news    = await us.getNews("AAPL", { limit: 10 });
```

Registering a future market:

```ts
getMarketRegistry().register(new KrMarketAdapter()); // wrapped in cache automatically
```

## Tests & verification

- `npm test` — deterministic vitest suite (35 tests). Network is fully mocked via
  an injectable fetcher (`__tests__/mockFetcher.ts`), so the suite is the
  reproducible grader (E2E 하네스 계약): primary/fallback chains, parsing of dirty
  payloads, cache TTL + stale-on-error, and the registry.
- `npm run demo:us -- AAPL` — live smoke against the real free sources (not CI).

## Env keys

The US adapter needs **no API keys** (all sources are free/keyless). Optional
tuning vars are listed in `server/.env.example`. Supabase keys there are for later
persistence tasks and are auto-injected by BinDesk at the DB 연결 step.
