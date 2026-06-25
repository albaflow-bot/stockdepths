# 발굴 스크리너 (Discovery Screener)

SPEC 피드백 라운드 4. **후보 선정 = 결정론적 시장 스캔(엣지), LLM = 한 줄 코멘트(상용품)** (§0-Δ).
대형주를 그냥 읊는 "원론적 출력" 을 구조적으로 제거한다.

## 일배치 파이프라인 (`screenRunner.ts`, SPEC §3.3-Δ2)

| 단계 | 모듈 | LLM |
|---|---|---|
| 1. 마스터 갱신 | `adapterScan.ts` (주입식 소스) | 0 |
| 2. 전종목 지표 → `daily_screen`/`weekly_series` | `screenMetrics.ts` (RSI14/RVOL/52주/대금) | 0 |
| 3. 노이즈 필터 (동전주·유령거래·신규상장·관리/우선주) | `noiseFilter.ts` | 0 |
| 4. 대형주 배제 (시총 상위 X% → 모멘텀 카테고리 drop) | `screenMetrics.markLargeCaps` + `categories.ts` | 0 |
| 5. 6 카테고리 스크리닝 (정렬·임계값) | `categories.ts` | 0 |
| 6. 후보 풀 **oneshot** 코멘트 (한 줄 신호+근거) | `commenter.ts` | **1** |
| 7. 불변 스냅샷 저장 (`daily_screen` append-only + 아티팩트) | `screenStore.ts` | 0 |

후보 *선정* 은 5번까지 끝난다. LLM 은 후보당이 아니라 **후보 풀 전체에 1회**만 호출되고
(비용 불변), 키가 없으면 `deriveSignal` 결정론 폴백으로 graceful 진행한다.

## 카테고리 (SPEC §1-Δ)

`gainers`🚀 · `losers`🔻 · `volume_surge`🔥 · `unusual_value`💰 · `breakout`📈 · `oversold_bounce`↩️

**대형주 배제 규칙:** 모멘텀 카테고리(gainers/losers/volume_surge/breakout/oversold_bounce)에서
시총 상위 X% 를 완전히 제외. 대형주는 **이례신호**(RVOL≥3 또는 갭 ±5%)가 있을 때만 `unusual_value` 에 노출.
회귀 게이트(`screenPipeline.test.ts`)가 gainers/breakout/volume_surge 의 대형주 누수 0 을 강제한다.

## 임계값 (`config.ts`)

| | US | KR |
|---|---|---|
| 최소 주가 | $1 | 1,000원 |
| 최소 거래대금 | $5M | 5억원 |
| 상장 경과일 | ≥60 | ≥60 |
| 대형주 배제 N | 50 | 30 |

RVOL≥3 · RSI<30 · 갭±5% (D-5 제안 default). 미결정 항목은 `specs/decision-queue.md` DQ-4~8.

## 실행

```bash
npm run batch:screen -- --market US   # 오늘(UTC), 결과 콘솔 출력 + 영속화
npm run batch:screen -- --market KR
```

매일 장마감 후 `.github/workflows/daily-batch.yml` 이 자동 실행. 영속화는 Supabase(설정 시)
또는 디스크 `.bindesk/screener/*.json` (task 2 검색 store 가 그대로 읽음 → 배치↔검색 정합).

## 데이터 소스 한계 (DQ-6 / D-3)

기본 스캔(`adapterScan.ts`)은 *설정된 후보 유니버스* + 무료 일봉만 사용한다. 거래소 **전종목**
마스터·시가총액·관리종목 플래그는 무료 소스 미확정(`open`) — 확정되면 `adapterScan.ts` 만
교체하면 된다(파이프라인 엔진 불변). 시총 미확보 종목은 대형주 배제가 비활성.
