# AI 주식 타이밍 알리미 — mobile client (Expo / React Native)

The Android-first client. **Task 6** delivers the **Today's Picks home screen**.

## Stack & how it's tested

- **Expo / React Native + TypeScript** (Android + web). Source imports the
  idiomatic `react-native` primitives.
- On the **web/test** toolchain these resolve to **react-native-web** (aliased in
  `vitest.config.ts`); a small ambient `src/types/react-native.d.ts` lets typecheck
  pass without pulling the full RN package into the web test setup. On a real Expo
  build the genuine `react-native` applies. The Task 5 on-device rule engine is pure
  TS and imports unchanged here.
- **Unit/component tests**: vitest + @testing-library/react (jsdom) — the
  deterministic grader, runnable now.
- **E2E**: Playwright over Expo Web — the living spec for the critical user flow.

## Today's Picks home screen (Task 6)

`src/screens/TodaysPicksScreen.tsx` renders:

- A **prominent '참고 조언' disclaimer** (`AI는 보장이 아닌 참고 조언입니다.`) at the
  very top, **above all predictions**, in every state.
- 3–5 **`PickCard`s**: symbol + one-line rationale + **confidence/risk badges** +
  an expandable **'5년 백테스트 결과'** panel (leads with benchmark-relative excess
  return; degrades honestly when a pick has no backtest).
- Loading / empty / error states (error is friendly + retryable).

Data comes from the shared artifact via `data/picksClient.ts` (reads
`EXPO_PUBLIC_API_BASE_URL`); when unset/unreachable the screen shows a friendly
message instead of crashing.

## Design system

No `design.md` existed when this was built, so `src/theme/tokens.ts` **is** the
design system of record (calm, trust-first finance palette; Korean copy). If a
`design.md` is later added, it governs and these tokens reconcile to it.

## 분석 (Task 13 — Launch Pack)

Privacy-friendly **Plausible** analytics in `src/analytics/analytics.ts` — no
cookies, no PII, only coarse funnel events. Configured via
`EXPO_PUBLIC_PLAUSIBLE_DOMAIN`; **unset = no-op**, and `track` never throws.

Key funnel events are wired in:

- **`persona_set`** — fired from the first-run gate (`PersonaGate`) with
  `first_run: true` (and on edits with `false`).
- **`pick_view`** — fired when the home screen shows today's picks (`{ count }`).
- **`alert_opt_in`** — fired when the user enables alerts from the inbox opt-in
  banner (a local pref persists the choice).

## Resilience (RESILIENCE CONTRACT)

- `resilience/ErrorBoundary.tsx` — catches render errors, shows the real cause +
  full stack + **'오류 복사'**, with a retry.
- `resilience/errorLog.ts` — global `error`/`unhandledrejection` capture into a
  bounded localStorage ring (the web analog of `runtime-errors.ndjson`), with a
  breadcrumb trail. Never throws.
- `resilience/safeMode.ts` — **3-strike crash-loop** guard; three consecutive
  immediate crashes boot into a recovery screen instead of bricking the app.

## Commands

```bash
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest (unit/component) — 23 tests
npm run web            # Expo Web (dev)
npm run android        # Expo on Android
npm run e2e            # Playwright (needs the web server; CI installs browsers)
```

## Android 빌드 (설치용 APK)

Native Android 빌드 설정이 포함되어 있습니다:

- `eas.json` — 모든 프로필(`development`/`preview`/`production`)이 **사이드로드 가능한
  APK**를 생성합니다 (이 앱은 비공개 배포 — 스토어 미사용, SPEC §3 release model).
  `appVersionSource: "local"` 이라 버전은 `app.json` 의 `android.versionCode` 를 따릅니다.
- `babel.config.cjs` — `package.json` 의 `"type": "module"` 와 충돌하지 않도록
  CommonJS(`.cjs`) 로 둡니다 (web/test 툴체인은 이 파일을 읽지 않음 — 위 참고).

```bash
# 클라우드(EAS) 빌드
npx eas build -p android --profile preview
# 로컬 빌드 (Android SDK 필요): prebuild → gradle
npx expo prebuild --platform android --clean && (cd android && ./gradlew assembleRelease)
```

## 관심·보유 (Task 7)

`src/screens/PortfolioScreen.tsx` — watchlist add/remove + holdings P&L:

- **Local-only persistence** (`portfolio/repository.ts` → `data/storage.ts`): no
  login; data lives in on-device storage (web localStorage / native AsyncStorage),
  never sent anywhere. A "🔒 이 기기에만 저장됩니다" note makes this explicit.
- **Deterministic P&L** (`portfolio/pnl.ts`): return % = (price − cost) / cost;
  value/gain need quantity; missing price/quantity are handled (null), never
  silently zeroed. Pure + unit-tested.
- Live prices via `data/quotesClient.ts`; if quotes fail the holdings still render
  with cost basis and a non-blocking warning (graceful degradation).
- `AddHoldingForm` / `AddWatchForm` validate locally and surface repository
  validation errors inline.

A lightweight `navigation/AppShell.tsx` bottom-tab shell hosts the screens
(오늘의 추천 / 관심·보유 / 성적표 / 알림함 / 내 성향 / 약관).

## 약관 · 정책 (Task 11 — Launch Pack)

`src/legal/content.ts` is the single source of truth for the three legal
documents, rendered in-app by `screens/LegalScreen.tsx` (segmented selector) and
reusable by the web landing (Task 12):

- **투자 참고 조언 안내** — the picks/backtests/scorecard are 참고용, **not
  investment advice**, with no guaranteed returns; final decisions are the user's.
- **이용약관** — covers the **no-account** model and **on-device-only** storage.
- **개인정보처리방침** — no account info collected, personal data stays on the
  device, push tokens used only for delivery, no third-party sharing.

**Copy rule (enforced):** all Korean user-facing copy ends sentences with a proper
terminator and **never a trailing colon** — `legal/__tests__/content.test.ts`
lints every string for this and for required topic coverage (on-device storage,
no-account, '참고 조언' not advice). Legal pages are covered by unit tests (the
E2E CUF set stays at the contract's 5 core revenue/data flows).

## 알림함 (Task 10)

`src/screens/NotificationInboxScreen.tsx` — history of delivered daily digests and
event-driven target/stop-loss alerts with their one-line contextual advice:

- `notifications/` — local domain: `types.ts`, badge label/tone mapping
  (`labels.ts`), builders that turn a delivered digest / fired rule-engine alert
  into an item (`record.ts`), and an on-device repository (`repository.ts`,
  idempotent by id, bounded ring, read-state).
- `NotificationCard` shows a type badge (오늘의 추천 / 목표가 도달 / 손절선 도달 / …),
  title, one-line advice, an unread dot, and a relative timestamp (`src/time.ts`).
- Filter by 전체 / 추천 / 알림, tap to mark read, "모두 읽음" for all, with an empty
  state. No login — everything is on-device.

## 성적표 (Task 9)

`src/screens/ScorecardScreen.tsx` — honest performance as **infographics**, not
text lists:

- **Headline**: benchmark-relative cumulative excess return (big, tone-colored)
  with a `ComparisonBars` chart (내 추천 vs SPY).
- **Win rate** as a `WinRateBar` progress bar; **per-trade average** and **MDD** as
  `MetricTile`s.
- **Realized alongside the 5Y backtest** (`RealizedVsBacktest`): a two-column
  실제 vs 백테스트 comparison — the core trust device ("이 로직은 지난 5년이면 이랬다"
  next to what actually happened).
- **Filterable by 1W/1M/3M/YTD** (`PeriodFilter`); best/worst chips.
- Mirrors the server scorecard (Task 4) via `data/scorecardClient.ts`; pure chart
  geometry in `charts/proportion.ts`. Honestly shows windows where the picks
  trailed the benchmark (negative excess), never hiding losers (SPEC §정직한 성적표).

## 투자 성향 (Task 8)

First-run, **no-skip** persona gate (`navigation/PersonaGate.tsx`): the whole app
is blocked until a persona is chosen.

- `screens/PersonaSetupScreen.tsx` — selectable-toggle UI for 안정형 / 중립형 /
  공격형 or **직접 설정** (custom target return % + stop-loss %). Selection
  **toggles**: tapping the selected option deselects it — there is **no separate
  clear button** (SPEC Task 8). No skip control exists.
- `persona/` — pure builders + validation (`config.ts`), local repository
  (`repository.ts` → `data/storage.ts`, no login), and **volatility matching**
  (`matching.ts`): a persona maps to acceptable pick risk levels.
- Wiring: the gate passes the persona to `AppShell`, which (a) hosts a 내 성향 tab
  to edit it and (b) passes it to the home screen, where each pick is tagged
  **성향 적합 / 성향 주의** by `pickMatchesPersona` (SPEC §3.2: persona "determines
  stock volatility matching").

## Critical user flows (E2E)

| CUF | Spec |
|---|---|
| 첫 실행 성향 게이트(건너뛰기 불가) → 성향 선택 → 앱 진입 | `e2e/persona-gate.spec.ts` |
| 홈 진입 → 디스클레이머 확인 → 추천 카드 → '5년 백테스트 결과' 펼쳐 초과수익 확인 | `e2e/todays-picks.spec.ts` |
| 관심·보유 진입 → 보유(매수가) 추가 → 수익률 확인 | `e2e/portfolio.spec.ts` |
| 성적표 진입 → 초과수익 헤드라인 → 기간 필터 전환 | `e2e/scorecard.spec.ts` |
| 알림함 진입 → 목록 확인 → 필터 → 읽음 처리 | `e2e/notifications.spec.ts` |

> Note: the home/portfolio specs run against a fresh context where the persona
> gate appears first; those specs seed a persona via `localStorage` (or pass
> through the gate) before exercising their flow.

The picks API is mocked via Playwright route interception (deterministic, no real
backend). CI (`.github/workflows/e2e.yml`) installs Playwright browsers + Expo deps
and runs typecheck → unit tests → E2E automatically — no manual setup.

## Tests

Task 7 adds: `portfolio/__tests__/pnl.test.ts` (return %/value/gain math + edge
cases), `portfolio/__tests__/repository.test.ts` (add/remove/dedupe/validate +
persistence + corrupt-store recovery), `data/__tests__/storage.test.ts`,
`components/__tests__/AddHoldingForm.test.tsx` (validation + success), and
`screens/__tests__/PortfolioScreen.test.tsx` (add holding → live return %, add/
remove watch, quotes-fail degradation). 47 tests total.

## Tests in this task (Task 6)

- `src/__tests__/formatters.test.ts` — badge labels/tones, percent formatting.
- `src/components/__tests__/PickCard.test.tsx` — card render, badges, backtest
  panel expand/collapse, honest empty state, negative-excess formatting, the exact
  disclaimer phrase.
- `src/screens/__tests__/TodaysPicksScreen.test.tsx` — disclaimer-above-predictions
  in every state, ready/error+retry/empty flows.
- `src/resilience/__tests__/resilience.test.tsx` — error-log ring + breadcrumbs +
  no-throw, 3-strike safe mode, ErrorBoundary catch/passthrough.
