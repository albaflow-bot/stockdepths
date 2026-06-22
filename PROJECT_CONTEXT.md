# 프로젝트 컨텍스트 (Project Context)

이 프로젝트는 [BinDesk](https://github.com/albaflow-bot/bindesk) 가 자동 생성한 MVP 입니다.

## 빌드 명세 (Source of Truth)

[`SPEC.md`](./SPEC.md) 가 이 프로젝트의 정의서입니다. **변경 작업 시 먼저 읽으세요.**

SPEC.md 는 다음 구조로 작성됩니다 (Phase 84 v0.3+):
- §1 아이디어
- §2 활성 페르소나 (12 페르소나 중 LLM activator 가 선택)
- §3 페르소나별 findings (각 페르소나 답변 추출 결과)
- §4 미해결 질문

## AI 에이전트 가이드

이 프로젝트를 AI 도구로 작업할 때:

- **변경 작업 전**: `SPEC.md` 의 해당 페르소나 섹션 확인.
- **의문 시**: 코드보다 `SPEC.md` 를 신뢰. SPEC 은 사용자 응답의 ground truth.
- **새 기능 제안 금지**: SPEC 범위 밖 기능을 임의로 추가 ✗. 추가 요구는 사용자에게 명시 질문 후 SPEC 갱신.
- **언어**: UI 텍스트는 한국어 default. 코드 식별자·주석은 영어.
- **테스트 우선**: SPEC §3 QA 페르소나의 DoD (Definition of Done) 충족 후 PR.

## 자동 동기화 파일

이 디렉토리에는 본 파일의 미러 사본이 3개 더 있습니다 — 각 AI 도구의 자동 로드 convention 에 맞춤:

| 파일 | 자동 로드하는 도구 |
|---|---|
| `CLAUDE.md` | Claude Code (Anthropic CLI) |
| `AGENTS.md` | Codex CLI (OpenAI) |
| `GEMINI.md` | Gemini CLI (Google) |

**미러 파일은 직접 편집 금지** — 본 파일 (`PROJECT_CONTEXT.md`) 만 수정하면 다음 BinDesk 빌드 사이클에서 3 미러를 자동 재생성합니다.

## 메타 정보

- 생성 도구: BinDesk Phase 90 v0.4+
- SPEC 위치: `./SPEC.md`
- 디자인 토큰 (선택): `./design.md` (있으면 UI 작업이 따라야 함)
