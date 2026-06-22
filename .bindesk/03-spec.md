---
generated_at: 2026-06-21T11:44:38.044033300+00:00
model: claude
interview_id: ec51f70e-1c7f-4d7f-a572-92f157a565f8
---

# __📱 앱 이름(가칭)_ AI 주식 타이밍 알리미___

## 1. Idea

**📱 앱 이름(가칭): AI 주식 타이밍 알리미**

**핵심 기능**
1. **오늘의 추천 종목 (장기 데이터 기반)** — AI가 매일 한 번, *최근 동향 + 과거 5년 흐름(장기 추세·변동성)*을 함께 분석해 주목 종목 3~5개를 이유와 함께 제공
2. **관심종목 & 내 보유종목 관리** — 관심목록 담기 + 내가 산 가격을 넣어 수익률 추적
3. **나의 투자 성향 설정** — 목표 수익률·손절선 또는 안정형/중립형/공격형 선택 (성향에 맞는 변동성 종목 매칭)
4. **매수/매도 타이밍 푸시 알림 (규칙 + 맥락 조언)** — 목표 도달 알림 + 흐름·업황 고려 한 줄 조언(전량/분할 매도). 근거는 검증된 뉴스·공시 기반 (찌라시 제외)
5. **추천 성적표 (수익률·적중률)** — 과거 추천의 실제 수익률을 기간과 함께 정직하게 공개 → 신뢰도의 핵심이자, 고도화 효과 검증 도구

**부가:** 신뢰도·리스크 표시, AI는 정답 아닌 '참고 조언' 톤 (*추후 확장: 자동매매, 고급자용 개인 API 키 옵션*)

**형태:** 안드로이드 폰 앱 (무료) — 푸시 알림이 핵심
**운영 방식:** 서버에서 '오늘의 추천'을 하루 한 번 만들어 공용 제공(AI 비용 최소화), 개인 알림·수익률은 단순 계산으로 처리
**대상 시장:** 미국(나스닥/S&P) + 한국(코스피/코스닥)

## 2. Active personas (Phase 84 — dynamic)

- [✓] Business Analyst — always active
- [✓] Product Manager — always active
- [✓] Software Architect — always active
- [✓] Senior Developer — always active
- [✓] QA Engineer — always active
- [⊘] UX Designer — skipped: "not applicable to this idea"
- [⊘] Security Engineer — skipped: "not applicable to this idea"
- [⊘] DevOps / SRE — skipped: "not applicable to this idea"
- [⊘] Data / ML Engineer — skipped: "not applicable to this idea"
- [⊘] Customer Support Lead — skipped: "not applicable to this idea"
- [⊘] Marketing / GTM — skipped: "not applicable to this idea"
- [⊘] Legal / Compliance — skipped: "not applicable to this idea"
- [⊘] Overseas Marketing — skipped: "not applicable to this idea"
- [⊘] B2B Sales — skipped: "not applicable to this idea"
- [⊘] Field Data Analyst — skipped: "not applicable to this idea"
- [⊘] Localization Engineer — skipped: "not applicable to this idea"

## 3. Persona findings

### 3.1 분석가 (Business Analyst)

- Target users: Private group of 3 close friends: 1 stock novice + 2 experienced traders (10+ years each)
- Market coverage: US (NASDAQ/S&P) + Korea (KOSPI/KOSDAQ)
- Core problem: Need daily AI stock recommendations combining recent trends + 5-year historical analysis; buy/sell timing alerts; success metric definition needed
- Platform: Android mobile app (free, push-notification-first)
- Deployment scope: Private/closed group (3 users only); server generates daily recommendations once to minimize AI cost
- Success metric (recommendation): Win Rate (hit % of recommendations that moved favorably) + Actual User Profit % vs. buy-and-hold baseline + Cumulative ROI per user

### 3.2 PM (Product Manager)

- Target users: Korean (Kospi/Kosdaq) + US (Nasdaq/S&P) retail stock investors, age 25–60, risk-averse to aggressive
- Core problem: Timing uncertainty on buy/sell decisions; signal-to-noise ratio overwhelms individual traders; need AI-validated advice with transparent track record
- Authentication: No login required (user explicit). Anonymous usage, persistent local portfolio via device storage only
- Core recommendation engine: Server generates once daily: multi-year historical (5Y) + recent trend analysis → 3–5 actionable stocks + reasoning. Single oneshot inference per day (cost-optimized). Client-side portfolio tracking (cost basis, holdings) local only
- Trust layer: Transparent performance scorecard: past recommendations ranked by period (1W/1M/3M/YTD) with win rate + actual ROI. Explicit 'AI is advice not guarantee' disclaimer prominently above all predictions
- Investment persona: User selects Conservative / Neutral / Aggressive (or custom target return % + stop-loss %), determines stock volatility matching. Re-prompt at first-run (no skip)
- AI backend selection: Claude Sonnet 4.6 primary (quality + reasoning). Optional Gemini for cost scaling if server load exceeds threshold. OAuth + API key fallback pattern
- Notification/alert strategy: Dual tier: (1) Daily digest push (static time, e.g., 9 AM market open) with top 3–5 picks + market context. (2) Event-driven alerts when user's portfolio touches target price / loss threshold (on-device rule evaluation)

### 3.3 아키텍트 (Software Architect)

- Data source strategy: Zero-cost market/news data only — prefer free public APIs (e.g. broker/exchange delayed quotes, RSS news/disclosure feeds); fall back to web crawling/scraping where no free API exists, per user '무조건 무료이고 필요하다면 크롤링이라도 하라'
- Compute split: Server generates 'today's picks' once per day as a shared public artifact (single LLM run amortized across all users to minimize AI cost); per-user watchlist, holdings P&L, and alert thresholds computed by simple deterministic math (no per-user LLM calls)
- Notification backbone: Push notification is the core surface — FCM for Android delivery; server-side rule engine evaluates target-reached / stop-loss triggers against cached quotes and pushes a one-line contextual note
- Data freshness model: Daily batch pipeline: crawl/fetch quotes + verified news/disclosures, run long-term (5yr trend/volatility) + recent analysis, persist picks with rationale and a track-record snapshot for the scorecard
- Track-record persistence: Every daily recommendation immutably logged with entry context so realized returns and hit-rate can be recomputed honestly over arbitrary periods — the scorecard reads from this append-only history, not regenerated
- Multi-market ingestion: Pluggable per-market source adapters (US: Nasdaq/S&P, KR: KOSPI/KOSDAQ) behind a common quote/news interface, so a free-source or crawler can be swapped per market without touching downstream pick/alert logic

### 3.4 개발자 (Senior Developer)

- Experience level: Seasoned investor with long track record; currently profitable; strategy is tacit/intuitive rather than explicit or rule-based
- Core gap: Profitability exists but rationale is opaque to themselves ('나도 모른다'); unable to articulate or systematize what is working
- Decision-making archetype: Gut-feel/intuition-driven; not documentation-first; likely high confidence biased by past success
- Primary app motivation: Formalize tacit knowledge into explainable recommendations; use AI to rationalize/validate existing intuitive patterns
- Risk tolerance: Moderate-to-high; existing profitability implies comfort with volatility and longer holding periods
- Recommendation persona type: Pattern validator (not rule author); seeks confident structure for decisions already working intuitively; performance scorecard is trust anchor

### 3.5 QA (QA Engineer)

- Target users: Individual retail stock traders across US (Nasdaq/S&P) and Korea (KOSPI/KOSDAQ) markets
- Core problem: Traders need daily AI stock recommendations with timing alerts informed by both recent trends and 5-year historical patterns, plus risk-aligned watchlist tracking
- Release model: Private app—production release and first user exposure are simultaneous (no staged rollout, closed beta, or store mechanics)
- Backtesting automation: All recommendations must include automatic backtesting results (not manual post-hoc verification); backtesting data feeds into performance scorecard
- Feature scope: Implement both automatic backtesting and real-time push notifications together (balanced scope per user recommendation); backtesting validates recommendation quality before alert delivery
- Success criteria: Performance scorecard accuracy (win rate % and realized returns vs recommendations); public transparency of past recommendation outcomes drives user trust

## 4. Open questions

- (none)


---

## 🧭 기획 회의 결과 (디스커버리)

### 핵심 차별점 — 왜 이 앱을 써야 하나
- **정직한 성적표 + 자동 백테스팅의 결합** (PM·QA 합의). 시중 추천앱은 "맞은 것만" 보여주지만, 이 앱은 과거 추천을 벤치마크(S&P500·코스피) 대비 누적 수익률로 박제하고, *추천 직전에 같은 전략을 과거 5년에 자동으로 돌려본 결과*를 함께 보여줍니다. "이 로직은 지난 5년이면 이랬다"가 추천과 한 화면에 붙는 게 핵심 신뢰 장치입니다.
- **장기 추세 × 최근 동향 2축 분석** — 단타 시그널 앱과 달리, 5년 변동성·추세 위에 최근 흐름을 얹어 *성향(안정/중립/공격)에 맞는 종목만* 매칭합니다. 비전문가(클라이언트 본인)도 "왜 이 종목인지"를 한 줄로 이해할 수 있게 만드는 것이 차별점입니다.

### 기술 타당성·리스크
- **MVP 가능합니다** (아키텍트). 서버에서 하루 1회 배치로 '오늘의 추천'을 생성→공용 제공, 개인 수익률·알림은 단말 로컬 계산. AI 호출이 하루 1회뿐이라 비용·구조 모두 가볍습니다. 푸시는 FCM 무료.
- **무료 데이터 리스크 (가장 큰 변수)** — 미국(나스닥/S&P)은 무료 일봉·5년 과거 데이터 경로가 비교적 넓지만, 한국(코스피/코스닥)의 무료·합법 데이터 경로는 **착수 전 실제로 확인이 필요**합니다(있다/없다 단정 보류). 크롤링은 가능해도 약관·차단 리스크가 있어, 1차로 공식·무료 소스 확보 가능성을 검증한 뒤 안 되면 크롤링을 보조로 둡니다.
- **현실적 대안** — 타이밍 알림은 *실시간*이 아니어도 됩니다. 무료 데이터는 15~20분 지연이 흔하지만, 이 앱은 장기 타이밍이라 일봉·종가 기준으로 충분합니다. 단, "분 단위 매매 신호"는 처음부터 범위에서 제외하길 권합니다.
- **법적 톤** — 3인 프라이빗 앱이라 규제 부담은 작지만, '투자 자문'이 아닌 '참고 조언' 디스클레이머는 화면에 명시해야 합니다.

**추천 성공 지표 제안 (요청하신 답)** — 적중률 단독은 함정입니다(작은 이익 9번·큰 손실 1번도 90%). 다음 4종을 묶어 공개하길 권합니다.
- 벤치마크 대비 **누적 초과수익률**(가장 정직한 핵심)
- **적중률**(보조)
- **건당 평균 수익률**
- **최대 낙폭(MDD)** — 성향별 리스크 검증용

### 정보구조(IA) — 핵심 화면·메뉴
- **① 오늘의 추천** (홈) — 3~5종목, 이유 한 줄 + 신뢰도/리스크 배지 + "5년 백테스트 결과" 펼침
- **② 관심·보유** — 관심 담기 / 매수가 입력 → 수익률 추적
- **③ 내 성향** — 안정·중립·공격 또는 목표수익·손절선 (로그인 없이 단말 저장)
- **④ 성적표** — 과거 추천 실적 + 자동 백테스팅 결과(동일 화면)
- **⑤ 알림함** — 목표 도달·맥락 조언 푸시 이력
- 로그인 없음 → 모든 개인 데이터는 단말 로컬 보관(프라이빗 앱에 적합).

### 우선순위 (MVP)
- **지금(Must)**: 오늘의 추천(미국 종목 먼저), 보유 수익률 추적, 성향 설정, 푸시 알림, 성적표+자동 백테스팅
- **나중(Later)**: 한국 시장 추가(무료 데이터 검증 후 패스트팔로우), 자동매매, 개인 API 키 옵션, 분할매도 정밀 조언

### 한 줄 제안
> 분석 결과, **'추천 옆에 5년 백테스트와 정직한 성적표를 항상 붙이는' 신뢰 우선 앱**으로 만들되, 1차 출시는 무료 데이터가 확실한 **미국 시장으로 먼저** 내고 한국은 데이터 확인 후 바로 잇는 것이 가장 좋습니다.
