# 구현 태스크 목록

## 1. US market data ingestion adapter (free quotes + 5Y history)

- **우선순위**: high
- **예상 시간**: 2.0h

Build a pluggable per-market source adapter for US (Nasdaq/S&P) behind a common quote/news interface. Fetch free/delayed daily candles and 5-year historical series; fall back to crawling RSS news/disclosure feeds where no free API exists. Normalize into a cached quote/news model downstream pick/alert logic reads.

## 2. Daily recommendation batch pipeline (single LLM oneshot)

- **우선순위**: high
- **예상 시간**: 2.0h

Server-side daily batch that runs once: combine 5Y trend/volatility analysis with recent-trend analysis, produce 3-5 actionable picks with one-line rationale and confidence/risk badges. Single Claude Sonnet 4.6 oneshot per day (Gemini fallback on load), amortized as one shared public artifact.

## 3. Automatic backtesting engine

- **우선순위**: high
- **예상 시간**: 2.0h

For each daily pick, automatically backtest the same logic over the prior 5 years before delivery. Compute benchmark-relative cumulative excess return (S&P500), win rate, per-trade average return, and max drawdown (MDD). Results feed both the recommendation card and the scorecard.

## 4. Append-only track-record persistence + scorecard computation

- **우선순위**: high
- **예상 시간**: 1.5h

Immutably log every daily recommendation with entry context so realized returns and hit-rate are honestly recomputable over arbitrary periods (1W/1M/3M/YTD). Provide a read API that derives the scorecard from this append-only history, never regenerated.

## 5. FCM push backbone + on-device rule engine

- **우선순위**: high
- **예상 시간**: 2.0h

Wire FCM for Android delivery. Server pushes the 9 AM daily digest (top 3-5 picks + market context). On-device deterministic rule engine evaluates holdings against target price / stop-loss thresholds and emits a one-line contextual buy/sell note (no per-user LLM).

## 6. Android — Today's Picks home screen

- **우선순위**: high
- **예상 시간**: 1.5h

Home tab rendering 3-5 picks with one-line rationale, confidence/risk badges, and an expandable '5년 백테스트 결과' panel. A prominent 'AI는 보장이 아닌 참고 조언입니다.' disclaimer sits above all predictions. Follow design.md design system for layout, color, and components.

## 7. Android — Watchlist & holdings P&L tracking (local storage)

- **우선순위**: high
- **예상 시간**: 1.5h

Watchlist add/remove plus holdings entry where the user inputs cost basis to track return %. All personal data persisted to on-device storage only (no login). Deterministic local P&L math. Follow design.md for cards, inputs, and list styling.

## 8. Android — Investment persona setup (first-run gate)

- **우선순위**: medium
- **예상 시간**: 1.0h

First-run, no-skip selection of Conservative / Neutral / Aggressive (or custom target return % + stop-loss %). Stored locally and used to match pick volatility. Follow design.md for the selectable-toggle UI; selection must toggle, no separate clear button.

## 9. Android — Scorecard screen (honest performance)

- **우선순위**: high
- **예상 시간**: 1.5h

Render past-recommendation outcomes alongside automatic backtest results on one screen: benchmark-relative cumulative excess return as the headline, plus win rate, per-trade average return, and MDD, filterable by 1W/1M/3M/YTD. Use infographic-style visualization per design.md, not plain text lists.

## 10. Android — Notification inbox screen

- **우선순위**: medium
- **예상 시간**: 1.0h

History tab listing delivered daily digests and event-driven target/stop-loss alerts with their one-line contextual advice. Follow design.md for the list and badge styling.

## 11. [Phase 42 — Launch Pack] Legal pages (terms, privacy, advice disclaimer)

- **우선순위**: medium
- **예상 시간**: 1.0h

Author 약관, 개인정보처리방침, and an investment '참고 조언' disclaimer page (not financial advice). Cover on-device-only data storage and no-account model. Korean user-facing copy ends sentences with proper terminators, never a trailing colon. Follow design.md typography.

## 12. [Phase 42 — Launch Pack] Landing page (hero, features, CTA, OG)

- **우선순위**: medium
- **예상 시간**: 1.5h

Build a marketing landing page with a heroline emphasizing the honest scorecard + auto-backtest trust angle, a feature section for the 5 core screens, an install CTA, and OG meta tags. Follow design.md design system for visual identity.

## 13. [Phase 42 — Launch Pack] Analytics + email integration

- **우선순위**: low
- **예상 시간**: 1.0h

Integrate Plausible (or GA4) for privacy-friendly usage analytics and Resend for transactional/announcement email. Track key funnel events (first-run persona set, pick view, alert opt-in) and wire a basic email sender for launch announcements.

