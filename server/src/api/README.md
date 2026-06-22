# HTTP API

The endpoints the mobile client talks to (added during MVP diagnosis to close the
client↔server integration gap). Zero-dependency Node `http`; open CORS for the app.

| Endpoint | Returns |
|---|---|
| `GET /api/picks/today?market=US&date=YYYY-MM-DD` | the shared `DailyPicksArtifact` for the day (404 if not generated yet) |
| `GET /api/quotes?symbols=AAPL,MSFT` | client-shaped quotes `[{symbol, price, previousClose, changePercent, asOf}]` (bad symbols skipped) |
| `GET /api/scorecard?asOf=YYYY-MM-DD` | the derived `Scorecard` (realized metrics + per-period 5Y backtest aggregate) |
| `GET /api/health` | `{ ok: true }` |

Backed by the same disk-persisted stores the batch/recorder write to
(`ArtifactStore`, `TrackRecordStore`) and the cached market adapter.

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
