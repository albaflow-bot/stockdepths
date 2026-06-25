# __📱 앱 이름(가칭)_ AI 주식 타이밍 알리미___

## 0. 제품 북극성 (Product North Star) — 타이밍 우선

> 이 섹션은 피드백 라운드 3 §5.0 의 우선순위 재정의를 **SPEC 본문에 박제한 캐논(canonical)** 이다.
> 이후 모든 화면·기능 설계는 이 북극성을 따른다. (출처: 사용자 명시 — *"메인은 매수와 매도 타이밍을 알려주는 것이다."*)

**제품의 존재 이유는 "지금 살까 / 팔까 / 기다릴까"를 알려주는 것이다.**

| 등급 | 기능 | 역할 |
|------|------|------|
| **🎯 1차 (메인)** | **매수/매도 타이밍 신호·알림** | 제품의 존재 이유. 모든 화면·알림이 이 결정으로 수렴 |
| 2차 (보조 입력) | 오늘의 추천 종목 | 타이밍을 판단할 *후보* 공급 |
| 2차 (보조 입력) | 실시간 뉴스·시장 트렌드 요약 | 타이밍 판단의 *맥락(왜)* 보강 |
| 3차 (신뢰) | 추천 성적표 + 타이밍 적중률 | 타이밍 로직의 정직성 증명 |

**설계 원칙 (강제):**
1. **모든 종목 표면은 한 줄 타이밍 신호로 환원한다.** 추천·뉴스·트렌드·지수는 그 자체가 목적이 아니라, "매수 적정/매도 검토/보유 유지/관망" 한 줄로 귀결되는 *입력*이다.
2. **정보 나열로 끝나는 화면 = 미완성.** 표·수치·뉴스만 나열하고 "그래서 지금 뭘 할지"로 환원하지 않으면 이 제품에서는 미완성으로 본다. (memory: `feedback` 완결 착시 차단 정합)
3. **근거 없는 신호 금지.** 모든 타이밍 신호는 비전문가용 한 줄 근거를 동반한다.
4. **AI는 참고 조언.** 모든 신호 표면에 "AI 참고 조언 · 투자 책임은 본인" 디스클레이머를 고정한다(§3.2 정합).

> 미결정·deferred 항목은 코드 주석/SPEC 에만 적지 않고 **사용자 결정 큐**(`specs/decision-queue.md` / 앱 '결정 대기' 탭)로 노출한다 — 완결 착시 차단(memory 정합).

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

## 피드백 라운드 1

```markdown
## 5. SPEC Delta — 공학 엣지 추천 게이트 (Engineering Edge Gate)

> 이 delta 는 기존 SPEC §2~§4(인터뷰·강제질문 게이트, Phase 77/84)를 보강한다.
> 신규 단계 신설이 아니라 **기존 SPEC-진입 강제질문 게이트에 '엣지 차원' 1단계를 얹는다**.
> 본 주식 알리미 SPEC 자신에도 소급 적용한다(§5.6 본 앱 채택 엣지).

### 5.1 위치 & 흐름 (Placement)

- 단계: **인터뷰(수렴) 측**. 이데이션(발산)에는 두지 않는다.
- 정확한 삽입점: **강제질문 게이트(Phase 77) 통과 직후 → 세부 SPEC 질문 앞**.
  - 이유: 엣지가 정해지면 이후 인터뷰 질문이 **엣지-aware** 로 흘러야 하므로, SPEC 이 굳기 전에 프레이밍해야 한다.
- 성격: **차단형(통과 필수)**. 건너뛰기 없음. 단 **결론은 강제하지 않음**(informed override 허용 — §5.4).

```
이데이션(발산) → [강제질문 게이트 Phase 77] → ★엣지 게이트(신규)★ → 세부 SPEC 인터뷰(엣지-aware) → SPEC 확정
```

### 5.2 처리 파이프라인 (BinDesk 자동 — 인지노동 전부 자동화)

아이디어가 게이트에 도달하면 BinDesk 가 사용자 입력 없이 다음을 수행:

1. **도메인 리서치** — 기존 Scout 인프라(웹검색 + 24h TTL 캐시) 재사용. 그 분야에서 공개돼 있으나 *흩어지거나·느리거나·남들이 귀찮아 안 엮는* 데이터/워크플로 조사. **중복 신설 금지 — Scout 호출 경유.**
2. **후보 엣지 2~3개 생성** — 각 후보 = `[구체적 데이터 소스] + [그걸 가치로 바꾸는 자동화 파이프라인(실행 노가다)]`.
   - 금지: 추상 "AI로 분석", "그냥 LLM 쓰기"를 엣지로 제시 ✗.
   - 금지: 유료·독점·고가 데이터(위성·카드결제 등), '비밀 알파' 약속 ✗.
   - 엣지 = **독자 데이터/워크플로 시스템**, LLM 은 그 위의 분석가(부품).
3. **후보별 평가표 생성**(§5.3 검증 규칙 적용).
4. **추천 1개 산정 + 이유** → 차단 카드에 **pre-선택** 상태로 노출.
5. **엣지 미발견 판정 시** — 자동 전환 ✗. §5.4 세 갈래 분기 노출.

### 5.3 평가표 & 검증 깊이 (2-tier 검증)

후보 카드는 아래 4차원을 표기하되, **검증 깊이를 둘로 가른다**:

| 차원 | 성격 | 요구 | 미달 시 표기 |
|------|------|------|--------------|
| 데이터 존재·무료·접근성 | **검증 가능한 사실** | 실제 Scout/웹검색 + **출처 링크 + 근거 스니펫 필수** | `⚠ 미검증가설` (기본 추천 불가) |
| 구축 난이도(이 개발자가 가능한가) | 본질적 판단 | LLM 평가(근거 논리 명시) | — |
| 방어성(왜 commodity 가 아닌가) | 본질적 판단 | LLM 평가(보통 해자 = '실행·유지보수 노가다') | — |
| 데이터 비용 | 검증 가능한 사실 | 무료 티어 존재 검색 확인 | `⚠` |

**검증 비용 절충:**
- **추천 1개(pre-선택본)** = **풀검증**(존재·무료·접근성 전부 실검색 + 출처). 커밋되는 항목이므로.
- **나머지 후보** = **핵심 데이터 소스만 타깃 검증** + `✓검증됨` / `⚠미검증가설` 배지.
- 토큰은 **검증 가능한 사실에만** 소비(판단 영역은 검색 미실행). — `feedback_tokens_for_quality_not_speed` 일관(품질 지출 ✓, 중복 ✗).

**가드레일:** `⚠미검증`/`유료`/`존재 불확실` 소스는 입구에서 드롭되거나 ⚠로 강등되어 **기본 추천이 될 수 없다**. (`feedback_no_unverified_negative_claims` — 부재/접근불가를 검증 없이 단정·제시 ✗.)

### 5.4 게이트 통과 규칙 (직면 강제 / 결론 비강제)

**엣지 발견 시:**
- 추천 1개가 pre-선택된 카드 + 평가표 노출.
- 사용자는 **단 한
```

<!-- 위 §5.1~§5.4 는 피드백 라운드 1 의 아카이브 델타(원문 일부 잘림). 아래 §5.6 은 본 SPEC 에 실제 적용된 라이브 섹션이다. -->

## 5.6 본 앱 채택 엣지 (Adopted Engineering Edge — 주식 알리미)

> §5 엣지 게이트 준칙을 **본 SPEC 자신에 소급 적용**한 구체 사례다. 게이트가 산출하는
> 형식(데이터소스 + 자동화 파이프라인 + 4차원 평가표 + 엣지-aware 인터뷰)을 그대로 따른다.
> 이 섹션은 구현 코드(`server/src/edge/specInterview.ts` 의 `embedEdgeInSpec`)가
> 만들어 내는 임베드 결과와 동일한 구조이며, "원칙을 우리부터 지킨다"는 **선제적 신뢰** 장치다.

- **엣지**: 무료 시세 데이터 위에 올린 *개인화 타이밍 알림 자동화*
- **데이터 소스**: Yahoo Finance 무료 API (일봉·5년 과거 시세; 무료 경로 차단 시 웹 크롤링으로 폴백 — SPEC §3.3)
- **자동화 파이프라인**: 시세 정기 수집(cron 일배치) → 보유종목 모니터링 → 가격 임계값(목표가·손절선) 감지 → 사용자 알림 발송(FCM)
- **선정 이유**: 데이터는 공개·무료지만, *정기 수집·임계값 규칙·알림 발송을 끝까지 자동으로 엮는 실행 노가다*가 해자다.

**평가표**

| 차원 | 수준 | 배지 | 근거 |
|------|------|------|------|
| 데이터 존재·무료·접근성 | 풀검증 | ✓검증됨 | Yahoo Finance 가 무료 일봉·5년 과거 시세를 공개 제공. 본 앱의 US 어댑터(`server/src/market/adapters/us.ts`)가 실제로 수집·정규화하며 테스트로 검증됨. |
| 구축 난이도 | 판단 | 4/5 | HTTP 수집 + 캐시 + 결정적 P&L 계산 + cron 배치. 이미 구현·테스트 완료된 범위. |
| 방어성 | 판단 | 4/5 | **커스텀 크롤링/자동화(수작업 0)** vs 일반 증권사 앱의 *1회 클릭(사용자가 매번 직접 확인)*. 모니터링·임계값·알림을 무인으로 잇는 유지보수 노가다가 모방 비용. |
| 데이터 비용 | 풀검증 | ✓검증됨 | **0원** (공개 데이터). 무료 티어만으로 일봉·과거 시세 확보. 유료·독점 소스 의존 없음. |

> 가드레일 적합성: 추상 "AI로 분석" 아님(데이터/워크플로 시스템이 본체, LLM 은 하루 1회 추천 분석가일 뿐). 유료·독점 데이터 의존 없음(0원). 존재·비용은 **풀검증**(코드·테스트가 출처·근거).

**엣지-aware 인터뷰 (본 SPEC 에 반영된 결론)**

- **Q. 이 'Yahoo Finance 무료 API' 를 '시세 수집→모니터링→임계값 감지→알림' 파이프라인에서 어떻게 활용하실 건가요?**
  - 서버 일배치로 시세·5년 과거를 수집해 '오늘의 추천'을 1회 생성(공용 아티팩트)하고, 개인 보유종목 P&L·임계값은 단말에서 결정적으로 계산해 도달 시 FCM 으로 한 줄 맥락 조언을 푸시한다.
- **Q. 방어성의 핵심인 '수작업 없는 자동화'를 어떻게 지속적으로 유지하실 계획인가요?**
  - 무료 소스 스키마 변동에 대비해 어댑터를 per-market 인터페이스 뒤에 두고(`market/registry`), 파서 회귀를 테스트로 고정한다. 일반 증권사 앱이 요구하는 '매번 직접 확인'을 무인 모니터링으로 대체한다.
- **Q. 'Yahoo Finance' 의 무료·접근 조건이 바뀌거나 막히면 어떤 대비책이 있나요?**
  - 동일 인터페이스로 대체 무료 소스/RSS·공시 피드로 교체하거나, 약관 범위 내 웹 크롤링으로 폴백한다(SPEC §3.3). 부재를 단정하지 않고, 차단 시 캐시 stale-on-error 로 graceful 하게 버틴다.

## 피드백 라운드 3

## 5. SPEC Delta — 관심·보유 탭 능동화 + 타이밍 우선순위 재정의 (2026-06-24 피드백)

### 5.0 우선순위 재정의 (제품 북극성 명문화)

기존 SPEC 의 5대 기능을 **타이밍 중심**으로 재서열한다. 사용자 명시: *"메인은 매수와 매도 타이밍을 알려주는 것이다."*

| 등급 | 기능 | 역할 |
|------|------|------|
| **🎯 1차 (메인)** | **매수/매도 타이밍 알림** (기능 ④) | 제품의 존재 이유. 모든 화면·알림이 이 결정으로 수렴 |
| 2차 (보조) | 오늘의 추천 종목 (기능 ①) | 타이밍을 판단할 *후보*를 공급하는 입력 |
| 2차 (보조) | 실시간 뉴스·시장 트렌드 요약 (신규, §5.3) | 타이밍 판단의 *맥락(왜)* 을 보강하는 입력 |
| 3차 (신뢰) | 추천 성적표 (기능 ⑤) | 타이밍 로직의 정직성 증명 |

> 설계 원칙: **추천·뉴스·트렌드는 그 자체가 목적이 아니라, 모든 표면에서 "지금 살까/팔까/기다릴까"라는 한 줄 타이밍 신호로 환원되어야 한다.** 정보 나열로 끝나는 화면은 이 제품에서 미완성으로 본다.

---

### 5.1 문제 — 관심·보유 탭이 수동적 (피드백 직접 대응)

현재 관심·보유 탭은 AI 주식 앱임에도 **빈 입력 폼만** 제시("보유 주식을 직접 입력하세요")하여, 정보 0 상태에서 사용자에게 거부감을 준다. AI/데이터 자산이 이 탭에 전혀 흐르지 않는 것이 원인.

**해결 방향:** 관심·보유 탭을 *입력 폼*에서 **종목별 타이밍 대시보드**로 전환한다. 빈 상태에서도 시장 컨텍스트(지수·상위 종목·뉴스)를 먼저 보여주고, 종목을 담으면 즉시 그 종목의 타이밍 신호가 따라붙는다.

---

### 5.2 네이버 증권 차용 분석 — 채택 / 비채택

검토 후 **타이밍 메인 원칙에 부합하는 것만** 차용. 나머지는 정보 과잉이라 비채택.

#### ✅ 차용

1. **시장 헤더 (지수 요약 바)** — 코스피/코스닥(KR) + 나스닥/S&P(US) 지수 + 전일대비·등락률. 관심·보유 탭과 홈 상단 공통 헤더로. *빈 보유 상태에서도 화면이 살아있게* 하는 1차 장치.
2. **TOP 종목 (거래상위·상승·하락·시가총액)** — 무료 KRX/거래소 데이터로 충분. 단, 단순 순위표가 아니라 **각 행에 AI 타이밍 배지**(아래 §5.4)를 붙여 "지금 주목할 종목 + 진입 적정성"으로 재해석. → 빈 관심목록에서 **"여기서 담기"** 진입점 역할.
3. **인기 검색 종목** — 시장 관심도 시그널. 추천 후보 풀 보강용으로 배치 파이프라인 입력에 합류.
4. **주요 뉴스 (검증 출처 한정)** — §5.3 뉴스 요약의 원천. 단 찌라시 제외 원칙 유지(공시·주요 언론사 RSS만).
5. **최근 조회 종목 (MY STOCK)** — 로컬 저장. 무로그인 정책과 정합(단말 로컬). 관심목록 진입 마찰 감소.

#### ⊘ 비채택 (정보 과잉 / 타이밍 무관)

- 환율·금리·유가·금·원자재·국제시장 환율: 일반 투자 포털 기능이며 본 앱의 타이밍 결정에 직접 환원되지 않음. (추후 거시 맥락 필요 시 §5.3 트렌드 요약에 *문장으로만* 흡수, 표로 나열 ✗)
- 프로그램 매매·콘탱고/백워데이션·업종/테마 상위 풀리스트: 전문 트레이더용 raw 데이터. 비전문가(클라이언트) 타깃과 불일치. → 단, 업종·테마 상위는 추천 엔진의 *내부 입력*으로만 사용하고 UI 전면 노출은 안 함.

---

### 5.3 신규 — 실시간 뉴스·시장 트렌드 요약 (보조)

배치 파이프라인(§3.3)에 **트렌드 요약 산출물**을 추가. 단 "메인은 타이밍" 원칙에 따라 *요약 자체로 끝내지 않고 종목 타이밍과 연결*한다.

- **산출물**: 하루 1회 배치에서 검증 뉴스·공시·지수 흐름을 LLM 1회 호출로 요약 → `daily_market_brief`
  - `headline_summary`: 오늘 시장 한 줄 (예: "반도체 강세 주도, 코스피 +3.26% 마감")
  - `sector_signals`: 강세/약세 섹터 2~3개 + 한 줄 근거
  - `linked_tickers`: 요약 안에서 언급된 종목 → 사용자 보유/관심목록과 **교집합이 있으면 해당 종목 카드에 뉴스 배지** 표시 ("내 보유 종목 관련 뉴스 1건")
- **비용**: 기존 '오늘의 추천' 배치와 **동일 호출에 합산**(별도 호출 ✗). 추천 프롬프트가 시장 컨텍스트를 어차피 읽으므로 같은 컨텍스트에서 brief 도 함께 산출.
- **출처 게이트**: 공시(DART/EDGAR) + 지정 언론사 RSS 화이트리스트만. 출처 URL 을 brief 에 박제(검증 가능성).

---

### 5.4 핵심 — 종목별 타이밍 신호 (메인 기능의 표면화)

관심·보유 탭, TOP 종목, 추천 카드 **모든 종목 표면에 공통으로 붙는 타이밍 배지**. 이것이 제품의 메인.

#### 신호 모델 (`TimingSignal`)

```
enum TimingAction { Buy, Sell, Hold, Watch }   // 매수 / 매도 / 보유유지 / 관망

struct TimingSignal {
  ticker: String,
  action: TimingAction,
  confidence: f32,          // 0.0~1.0, 성적표(§5)로 사후 검증
  one_line_reason: String,  // 비전문가용 한 줄 ("5년 추세 상단 + 최근 거래량 급증")
  context_news_ids: Vec<String>, // §5.3 linked_tickers 연결 (있으면)
  evaluated_at: DateTime,
  source: SignalSource,     // DailyBatch | OnDeviceRule
}

enum SignalSource {
  DailyBatch,    // 추천 배치에서 LLM 이 부여한 방향성 (장기×최근 2축)
  OnDeviceRule,  // 보유 종목의 목표가/손절선 도달 등 단말 규칙 평가 (기존 기능 ④)
}
```

#### 두 신호원의 역할 분리 (기존 §3.3 compute split 유지)

- **`DailyBatch`** (서버, 하루 1회, 공용): 종목의 *방향성* — Buy/Sell/Hold/Watch + 근거 한 줄. 추천 종목과 TOP 종목·인기 종목에 부여.
- **`OnDeviceRule`** (단말, 실시간, 개인): 보유 종목이 사용자가 설정한 *목표가·손절선·성향*에 도달했는지 결정론적 평가. → **푸시 알림 트리거**. LLM 호출 없음(비용 0).

> 두 신호가 같은 종목에서 충돌 시(예: 배치=Hold, 규칙=Sell[손절 도달]) **단말 규칙(개인 손절/목표)이 우선**. 화면엔 둘 다 표기하되 개인 규칙을 상단에.

#### 배지 UI (한글 텍스트 우선, 모호 아이콘 ✗ — memory 정합)

- 색·라벨: 매수=상승색 "매수 적정" / 매도=하락색 "매도 검토" / 보유유지="보유 유지" / 관망="관망". 색 테마는 identity 색과 분리(플레이버 무관).
- 각 배지는 한 줄 근거를 항상 동반(근거 없는 신호 ✗). 탭 시 장기×최근 2축 차트 + 근거 + 관련 뉴스(있으면).
- **신뢰 톤**: 모든 배지 영역 상단에 "AI 참고 조언 · 투자 책임은 본인" 디스클레이머 고정(기존 §3.2 정합).

---

### 5.5 관심·보유 탭 재구성 (빈 상태 → 능동 대시보드)

탭 레이아웃을 위에서 아래로 다음 순서로 재구성한다.

1. **시장 헤더** (§5.2-1) — 항상 표시. 빈 보유여도 화면이 비지 않음.
2. **오늘의 시장 브리핑** (§5.3 `daily_market_brief.headline_summary`) — 한 줄 + 강세/약세 섹터.
3. **내 보유/관심 종목 카드 리스트**
   - 보유 종목: 매입가 기반 수익률(로컬 계산) **+ `TimingSignal` 배지**(매도 검토/보유 유지) + 관련 뉴스 배지.
   - 관심 종목: 현재가 + `TimingSignal` 배지(매수 적정/관망).
   - **빈 상태일 때**: "아직 담은 종목이 없어요. 아래에서 오늘 주목할 종목을 담아보세요" → 4번으로 자연 유도.
4. **여기서 담기 — 오늘 주목 종목** (§5.2-2 TOP 종목 + §5.2-3 인기 종목, 각 행에 타이밍 배지) — **빈 입력 폼을 대체하는 능동적 진입점**. 한 번 탭으로 관심목록 담기(토글, 별도 해제 버튼 ✗ — memory 정합).
5. (접힘) 수동 직접 입력 — 기존 폼은 *접힌 보조 수단*으로 격하. "직접 종목 추가" 버튼으로만 펼침.

> 핵심 전환: **"입력하세요" → "골라서 담으세요(타이밍 신호 포함)".** AI/시장 데이터가 탭 진입 즉시 흐르게 하여 거부감 제거.

---

### 5.6 데이터·구현 메모

- **무료 데이터 (기존 §3.3 리스크 유지)**: 지수·TOP 종목·인기 종목은 KRX/거래소 무료 경로 또는 크롤링. KR 무료·합법 경로는 **착수 전 실증 필요**(기존 open question 유지, 단정 ✗). US 는 무료 일봉 경로 비교적 넓음.
- **신규 산출물 persistence**: `daily_market_brief`, 종목별 `TimingSignal`(DailyBatch 분)을 §3.3 append-only 추천 로그와 같은 배치 트랜잭션에 immutable 기록 → §5 성적표가 *타이밍 신호의 적중률*까지 사후 검증 가능(Buy 신호 후 실제 상승했나).
- **성적표 확장**: 기존 추천 수익률에 더해 **타이밍 신호 적중률**(Buy→상승 / Sell→하락 회피 비율)을 기간별(1W/1M/3M/YTD) 공개. 메인 기능의 정직성 증명.
- **비용 가드**: 뉴스 요약·종목 방향성 모두 **기존 하루 1회 추천 배치의 단일 LLM 호출에 합산**. 추가 호출 0. 개인 알림은 단말 규칙(LLM 0).

---

### 5.7 Out of scope (이번 delta)

- 환율·금리·유가·원자재 등 거시 지표 패널 (네이버 비채택분)
- 프로그램 매매·콘탱고 등 전문 raw 데이터 UI 노출
- 자동매매·개인 API 키 옵션 (기존 SPEC 의 추후 확장 유지)
- 실시간(틱) 시세 스트리밍 — 본 delta 는 일봉 + 단말 규칙 평가 범위. 실시간 호가는 별도 태스크(사용자 결정 큐로 노출).

## 피드백 라운드 4

## SPEC Delta — 베테랑 종목 발굴 + 한글 검색 (피드백 라운드 4)

> 본 delta 는 사용자 피드백("대형주 추천은 무가치 / 베테랑 타겟 / 코드 없이 추가 / 한글 검색 + 주간 추이")을 반영한 **전면 수정 캐논**이다.
> §0 북극성(타이밍 우선)은 유지하되, **"무엇을 후보로 올리는가(2차 입력)"의 기준을 전면 교체**한다.

---

### 0-Δ. 북극성 보강 — "남들이 못 주는 후보"

기존 §0 표의 2차 입력(오늘의 추천 종목)에 **차별화 제약**을 박제한다.

> **추천 후보의 존재 이유 = "아무 데서나 얻는 정보가 아닐 것".**
> 시가총액 상위 초대형주(JPM·AAPL·GOOGL·AVGO·V 류)를 *그 자체로* 오늘의 추천에 올리는 것을 **금지**한다. 이런 종목은 어디서나 얻으므로 본 제품의 엣지가 아니다 (memory: `feedback_llm_is_not_the_edge` 정합 — LLM-on-공개데이터 = 원론적 출력).
>
> 본 제품의 엣지 = **시장 데이터를 스캔해 "지금 움직이고 있는·거래가 몰리는·구조가 바뀐" 종목을 베테랑 시야로 먼저 띄우는 스크리너**다. LLM 은 그 위에 *왜·지금 뭘* 한 줄을 얹을 뿐, 후보 선정의 원천은 **결정론적 시장 스캔**이다.

---

### 1-Δ. Idea 교체 — "오늘의 추천" 재정의

기존 §1 핵심기능 #1 을 아래로 **대체**한다.

**#1. 오늘의 발굴 (Movers & Flow 스크리너 기반)**

매일 장중/장마감 시장 전체를 스캔해, 아래 *카테고리별*로 후보를 자동 선별한다. 각 후보는 §0 원칙대로 한 줄 타이밍 신호로 환원한다.

| 카테고리 | 한국어 라벨 | 선별 기준 (결정론) |
|----------|------------|-------------------|
| `gainers` | 🚀 급등주 | 당일 등락률 상위 N (저유동성·동전주 필터 후) |
| `losers` | 🔻 급락주 | 당일 등락률 하위 N (반등 후보 탐색용) |
| `volume_surge` | 🔥 거래폭발 | 거래량 / 20일 평균거래량 비율(RVOL) 상위 |
| `unusual_value` | 💰 대금집중 | 당일 거래대금 상위 (단순 거래량 ✗, 대금 기준) |
| `breakout` | 📈 신고가/돌파 | 52주 신고가 경신 or 박스권 상단 돌파 |
| `oversold_bounce` | ↩️ 과매도 반등 | RSI(14) < 30 이탈 후 반등 캔들 |

**대형주 배제 규칙 (강제):**
- 각 시장 시가총액 상위 X% (예: US 상위 50종목, KR 상위 30종목)는 `gainers/breakout` 등 *모멘텀 카테고리에서 제외*.
- 단, 초대형주에 **이례적 신호**(예: RVOL ≥ 3, 갭 ±5% 이상, 대량 공시)가 뜨면 `unusual_value` 한정으로 노출 허용 (이때는 "왜 지금 이게 이례적인가" 근거 필수).

**노이즈 필터 (강제, 동전주/유령거래 배제):**
- 최소 주가 (US: ≥ $1, KR: ≥ 1,000원), 최소 일평균 거래대금 (US: ≥ $5M, KR: ≥ 5억원), 상장 경과일 ≥ 60일.
- 관리종목/거래정지/우선주(KR) 기본 제외 (사용자 토글로 포함 가능).

---

### 3.3-Δ. 데이터 소스 보강 — 전종목 마스터 + 스크리닝 피드

기존 §3.3(아키텍트) 멀티마켓 인제스천에 추가.

1. **전종목 마스터 테이블** (한글 검색·코드리스 추가의 전제):
   - US: Nasdaq/NYSE 상장 심볼 마스터 (symbol, 영문명).
   - KR: KRX 전종목 마스터 (단축코드, **한글 종목명**, 영문명).
   - 매일 1회 갱신. 무료 소스(거래소 공개 마스터/지연시세 API) 우선, 없으면 크롤링 (사용자 방침 "무료·필요시 크롤링").

2. **일별 스냅샷 피드** (스크리너 입력):
   - 종목별: 당일 종가/현재가, 전일대비 등락률, 거래량, 거래대금, 20일 평균거래량(RVOL 계산용), 52주 고저, RSI(14).
   - 서버 일배치에서 전종목 계산 → `daily_screen` 테이블 적재. 스크리너는 이 테이블의 정렬·필터만 수행(LLM 호출 0).

3. **주간 추이 피드** (검색결과·상세 스파크라인용):
   - 종목별 최근 7거래일 종가 시계열 캐시 (`weekly_series`). 검색 시 즉시 미니 차트 렌더용.

---

### 3.2-Δ. PM 보강 — 코드리스 추가 + 한글 검색 (신규 핵심 화면)

기존 §3.2 에 화면 사양 추가.

**A. 종목 검색·추가 화면 (코드 불필요)**

사용자가 **종목 코드를 몰라도** 이름으로 검색해 관심종목/보유종목에 담는다.

- **입력:** 단일 검색창. 한글/영문/코드 모두 허용.
- **한글 부분일치:** `"삼성"` 입력 → 종목명에 "삼성"이 포함된 전 종목 나열 (삼성전자, 삼성전자우, 삼성SDI, 삼성바이오로직스, 삼성물산 …). 영문명·티커도 동시 매칭("apple" → AAPL).
- **검색 결과 카드 (각 종목):**

```
┌──────────────────────────────────────────┐
│ 삼성전자  005930  · 코스피                  │
│ 78,400원   ▲ +1.6% (오늘)                  │   ← 빨강=상승, 파랑=하락 (KR 관례)
│ [최근 7일 미니 스파크라인 ▁▂▄▆▅▆█]          │
│ 한 줄 신호: 매수 적정 · 5일선 회복           │   ← §0 타이밍 환원 (가능 시)
│            [＋ 관심]  [＋ 보유]              │
└──────────────────────────────────────────┘
```

  - **오늘 주가 + 상승/하락 + 등락률** 표시 (사용자 명시 요구).
  - **최근 1주 추이** 미니 스파크라인 (사용자 명시 요구).
  - **추가 버튼:** 코드 입력 없이 `＋ 관심` / `＋ 보유` 원터치. 보유 선택 시 매수가·수량 입력 시트로 이어짐.
- **정렬/필터:** 시장(US/KR), 거래대금, 등락률 토글.
- **색상 규약:** KR 상승=빨강·하락=파랑 / US 상승=초록·하락=빨강 (시장별 관례 분기). 색만으로 구분 ✗ → ▲▼ 기호 병기 (접근성).

**B. 데이터 모델 (검색·추가)**

```sql
-- 전종목 마스터 (검색 인덱스)
CREATE TABLE security_master (
  market        TEXT NOT NULL,        -- 'KOSPI'|'KOSDAQ'|'NASDAQ'|'NYSE'
  code          TEXT NOT NULL,        -- 단축코드/티커
  name_ko       TEXT,                 -- 한글 종목명 (KR)
  name_en       TEXT,                 -- 영문명
  is_etf        INTEGER DEFAULT 0,
  delisted      INTEGER DEFAULT 0,
  PRIMARY KEY (market, code)
);
-- 한글 부분일치 검색용 인덱스 (LIKE '%삼성%' 가속: trigram or 정규화 컬럼)
CREATE INDEX idx_master_name_ko ON security_master(name_ko);
CREATE INDEX idx_master_name_en ON security_master(name_en);

-- 일별 스크리닝 스냅샷
CREATE TABLE daily_screen (
  market TEXT, code TEXT, asof DATE,
  last REAL, change_pct REAL, volume REAL, turnover REAL,
  rvol REAL, high_52w REAL, low_52w REAL, rsi14 REAL,
  PRIMARY KEY (market, code, asof)
);

-- 주간 추이 (스파크라인)
CREATE TABLE weekly_series (
  market TEXT, code TEXT,
  closes TEXT,   -- 최근 7거래일 종가 JSON 배열
  updated_at DATETIME,
  PRIMARY KEY (market, code)
);
```

**C. 검색 API (서버)**

```
GET /api/search?q=삼성&market=ALL&limit=30
→ [{
    market, code, name_ko, name_en,
    last, change_pct, direction: "up"|"down"|"flat",
    weekly: [c1..c7],         // 스파크라인
    signal: { label, reason } | null   // §0 타이밍 환원(있으면)
  }, ...]
```
- 한글 검색: `name_ko LIKE '%' || :q || '%'` (정규화: 공백·우선주 접미 처리). 결과는 거래대금 desc 정렬.
- `direction` 은 `change_pct` 부호로 결정론 산출 (서버에서 확정 → 클라 색상 분기).

---

### 3.3-Δ2. 발굴 파이프라인 (서버 일배치 — LLM 비용 불변)

```
1. 마스터 갱신   → security_master upsert
2. 시세 인제스트 → 전종목 일봉/거래대금/RVOL/RSI/52주 계산 → daily_screen
3. 노이즈 필터   → 최소가격·대금·상장일·관리종목 제외
4. 대형주 배제   → 모멘텀 카테고리에서 시총 상위 X% drop
5. 카테고리 스크리닝(정렬·임계값) → 카테고리별 후보 N개 (LLM 0회)
6. LLM 1회 oneshot → 후보 풀에 대해 "왜 지금·무엇을(매수/매도/관망)" 한 줄 + 근거만 부여
                      (후보 *선정*은 5번이 이미 끝냄 → LLM 은 라벨링만)
7. track-record 스냅샷 append (기존 §3.3 정합)
```

> 핵심: **후보 선정 = 결정론적 시장 스캔(엣지), LLM = 한 줄 코멘트(상용품).** 이로써 "대형주만 읊는 원론적 출력" 문제를 구조적으로 제거한다.

---

### 3.5-Δ. QA 보강 — 회귀 게이트 (피드백 재발 방지)

1. **대형주 누수 테스트:** `gainers/breakout/volume_surge` 결과에 시총 상위 X% 종목이 (이례신호 예외 외) 포함되면 **fail**.
2. **노이즈 테스트:** 최소 주가·거래대금 미달 종목이 후보에 뜨면 fail (동전주 배제 검증).
3. **한글 검색 테스트:** `"삼성"` → 삼성전자(005930) 포함 + 부분일치 N건 ≥ 기대치, 응답 각 항목에 `weekly[7]`·`direction`·`last` 누락 시 fail.
4. **색상 분기 테스트:** KR 상승=빨강 / US 상승=초록 매핑 단위 테스트.

---

### 4-Δ. 결정 대기 큐 등재 (완결 착시 차단 — memory 정합)

아래는 본 delta 의 미결정 항목. **코드 주석에만 두지 말고** `specs/decision-queue.md` / 앱 '결정 대기' 탭에 노출한다.

- **D-1. 대형주 배제 임계 X%** — US 상위 50 / KR 상위 30 (제안 default). 사용자 확정 필요.
- **D-2. 카테고리 노출 범위** — 6개 전부 vs 핵심 3개(급등·거래폭발·돌파) 먼저. (제안: MVP=3개)
- **D-3. 데이터 소스 확정** — KRX/거래소 공개 마스터 + 지연시세 무료 API 우선, 미존재 시 크롤링 대상 사이트 명시 필요.
- **D-4. 시세 신선도** — 지연시세(무료) 허용 범위 (예: 15~20분 지연 표기). 실시간 필요 여부.
- **D-5. RVOL/RSI 임계값** — 거래폭발 RVOL≥3, 과매도 RSI<30 (제안 default).

