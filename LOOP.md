# LOOP.md — 993f1f20-26b1-4fcd-87ec-2f09f54079d0 (tauri)

> 본 파일은 빈데스크 chain 의 "구현 완료" 주장에 *상위 감독 루프* 를 강제합니다.
> AI 가 완료를 말하기 전 12 기준 모두 객관 증거로 통과해야 합니다.
> Phase 106 v0.2 (2026-06-10) — 자동 생성. 사용자 명시 편집 가능.

## 필수 통과 5 (binary pass/fail)

- [ ] **cargo check** — `cargo check -p bindesk-client` (0 error)
- [ ] **cargo test** — schema_export_test 등 핵심 테스트 통과
- [ ] **npm build** — `npm run build` (TS strict + Vite exit 0)
- [ ] **tauri build** — `npx tauri build` exit 0
- [ ] **부팅 검증** — `scripts/verify-bindesk-boot.ps1` 통과 (Responding=True + Title 정합)

## 측정 4 (숫자)

- exe mtime > ui/dist mtime (stale dist 회피)
- exe size delta < ±5% (회귀 신호)
- cargo warning count delta
- dogfood_trace JSONL 의 chain panic 0건

## 평가 3 (점수 1-5 + 근거 + 수정 액션 3-tuple 강제)

> **점수만 출력 ✗** — 빈데스크는 yes-man 평가를 schema validation 단계에서 거부합니다.

- **변경 컴포넌트 인접 기능 회귀 audit**
- **메모리 박제 정합성** (관련 feedback / project memory 검토)
- **이전 fix 와 충돌 ✗** (동일 카테고리 회귀 3+ → fix 멈추고 redesign)

## 자동 처리 vs 인간 호출 경계 매트릭스

| 자동 처리 (AI 가 직접) | 인간 호출 (반드시 확인) |
|---|---|
| 린트 / 타입 오류 수정 | DB 스키마 변경 |
| 단순 버그 수정 (재현 명확) | 데이터 손실 가능한 마이그 |
| 누락 테스트 추가 | 인증 / 권한 정책 변경 |
| 문서 drift fix | 결제 / 보안 관련 수정 |
| 단순 네이밍 수정 | 기능 범위 확대 (scope creep) |
| 통과 테스트 보존 | 통과 ✗ 테스트의 *기준 자체* 변경 |

## 모니터링·보안 finding 처리 (빈데스크 본체 → 본 프로젝트 상속)

> 보안·관찰 finding 도 "표시만" 하지 않습니다. 모든 finding 은 한국어 평어로 3가지를
> 강제 답변하고, "그래서 뭘 할지"를 CI 실패와 *동일한* 자동/인간 경로로 라우팅합니다.

- **평어 3답변 강제.** 모든 finding = (1) 무엇인지(기술용어 → 평어 번역) (2) 왜 중요한지
(3) 그래서 뭘 할지. 영어 raw(OWASP / CVE / severity)는 '원문 보기' 토글 뒤로만 — 평어가 default.
- **액션 3분류 강제.** 🟢 자동 처리됨/처리 중 (사용자 행동 0) · 🟡 확인·수정 필요
(1-click 또는 인간 큐) · ⚪ 확인만 (안전·참고). 보안 점수·등급(A~F) ✗ —
"지금 신경 쓸 게 있나요" 이분법 요약까지만.
- **자동/인간 라우팅 = CI 실패와 동일 경로.** patchable 의존성 취약점(버전 bump)
= 자동 (격리 worktree 검증 → PR, master 직접 push ✗ / auto-merge ✗). 설계·인증·결제
관련 finding = 인간 큐, 사람이 검토 후 '확인함' 으로 내려보냄.
- **한 인박스.** CI 실패 ∪ 보안 finding 을 같은 인간 호출 큐에서 처리 — 따로 챙길 필요 ✗.

## 운영 원칙 (빈데스크 본체 → 본 프로젝트 상속)

> 빈데스크를 제작하며 쓰는 원칙은 빈데스크가 만든 프로젝트에도 동일 적용됩니다.

- **토큰 = 품질용, 낭비 ✗.** 진행 속도만 위한 토큰 쏟기 / 중복 재실행 / 헛 재시도 ✗.
결과물을 한계치까지 정교화하는 *수정-검증 루프*에는 토큰 적극 투자. (병렬은 총 토큰이
순차와 동등하면 허용.)
- **자동 fix = 결정적 도구 우선.** lint/format/type 은 `--fix` 도구(eslint/prettier/
clippy/fmt)로 먼저 시도 → 로컬 검증 통과만 반영. LLM 패치는 결정적 fix 불가 시에만,
검증 게이트 후. 같은 실패 1회 제한 (무한 재시도 ✗).
- **인간 최소화.** 인간 선택 = 아이디어 + 버그 리포트 + 위 인간 호출 경계만. 그 외 자동.
- **"완료"는 증거로만.** AI 의 완료 주장은 아래 증거 보고서 12 항목 통과 전까지 무효.
- **SPEC 게이트.** 신규 기능은 SPEC(목표·제약·비-목표) 먼저, 그 다음 구현.

## 증거 보고서 자동 제출

chain 종료 직전 `submit_evidence_report` 가 호출되어 위 12 항목의 객관 결과를
`.bindesk/evidence_<round_id>.md` 로 자동 박제합니다. 인간 호출 대기 ≥ 1 건이면
chain 의 "완료" 표시 ✗ — 사용자 결정 게이트 enforce.
