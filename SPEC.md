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
