# HTTP API

The endpoints the mobile client talks to (added during MVP diagnosis to close the
client↔server integration gap). Zero-dependency Node `http`; open CORS for the app.

| Endpoint | Returns |
|---|---|
| `GET /api/picks/today?market=US&date=YYYY-MM-DD` | the shared `DailyPicksArtifact` for the day (404 if not generated yet) |
| `GET /api/search?q=삼성&market=ALL&limit=30` | 코드 없이 이름으로 종목 검색 (한글/영문/코드 부분일치) — `[{market, code, name_ko, name_en, last, change_pct, direction, weekly[7], signal}]`, 거래대금 desc 정렬, 빈 `q` 는 `[]` |
| `GET /api/discover?market=US` | 발굴 탭 데이터 — 일배치가 적재한 최신 카테고리 아티팩트 `{market, asof, categories{gainers,…}, stats}` (404 if 미생성). 각 후보에 `isLargeCap`/`unusual` 배지 플래그 포함 |
| `GET /api/quotes?symbols=AAPL,MSFT` | client-shaped quotes `[{symbol, price, previousClose, changePercent, asOf}]` (bad symbols skipped) |
| `GET /api/scorecard?asOf=YYYY-MM-DD` | the derived `Scorecard` (realized metrics + per-period 5Y backtest aggregate) |
| `GET /api/health` | `{ ok: true }` |

Backed by the same disk-persisted stores the batch/recorder write to
(`ArtifactStore`, `TrackRecordStore`) and the cached market adapter. `GET /api/search`
reads the `security_master` + `daily_screen` + `weekly_series` tables (the
`security_search_v` view via PostgREST when Supabase is configured, else an in-memory
seed store) and reduces each hit to a deterministic `signal` (no LLM call — SPEC §0-Δ).

## Run

```bash
npm run batch:daily   # generate today's picks (needs ANTHROPIC_API_KEY)
npm run api           # serve on PORT (default 8787)
```

Point the client at it: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8787` in
`mobile/.env.local`.

## Tests

`api/__tests__/handlers.test.ts` — picks (found / 404), quotes (client shape +
bad-symbol skip + 400 without symbols), scorecard, health, and unknown-path 404.
Handlers take injected services so they test without opening a socket.
