# Engineering Edge Gate

**Task 1 — 도메인 모델** · **Task 2 — 백엔드 (Scout + 후보생성 + 평가)** · **Task 4 — 선택 저장 & SPEC 주입** · **Task 5 — 미발견/Override 분기** (SPEC §5, 피드백 라운드 1).

The edge gate sits in the **interview (convergence)** flow, right after the
forced-question gate and before the detailed SPEC interview (SPEC §5.1). BinDesk
researches the domain, generates **2–3 candidate edges**, evaluates each across four
dimensions, and **pre-selects ONE** recommendation. The user must *face* it
(차단형) but is **not forced** to accept it — informed override is allowed (SPEC §5.4).

> An edge = `[구체적 데이터 소스] + [자동화 파이프라인(실행 노가다)]`. It is a
> **proprietary data/workflow system**; the LLM is the analyst on top, never the edge.
> "AI로 분석"·"그냥 LLM 쓰기" is prohibited as an edge (SPEC §5.2).

This task delivers the **types + guardrails** (`types.ts`) and the **audit-session
store** with the new `selectedEdgeId` / `edgeMetadata` columns (`store.ts`). The
research/evaluation pipeline and the blocking-card UI come in later tasks and
consume these shapes.

## Domain model (`types.ts`)

| Type | Role |
|---|---|
| `EdgeCandidate` | a data source + its automation pipeline + the 4-dimension table |
| `DimensionEvaluation` / `DimensionKey` | the four dimensions: **dataExistence · buildDifficulty · defensibility · dataCost** |
| `DimensionNature` | `verifiable` (existence, cost) vs `judgment` (difficulty, defensibility) |
| `VerificationLevel` | `full` (pre-selected recommendation) vs `core` (other candidates) |
| `VerificationResult` | `verified`/`unverified`/`warn` badge + 출처 링크 + 근거 스니펫 |
| `ProhibitionTag` | `AbstractAI` · `PaidExclusive` · `Unverified` — disqualifies the default |
| `EdgeGateResult` | candidates + the pre-selected `recommendedEdgeId` (+ `edgeFound`) |

### Two-tier verification (SPEC §5.3)

Tokens are spent only on **verifiable facts**, never on the judgment dimensions.

- **full** — the pre-selected recommendation. A `verified` badge **must** carry both
  a source link **and** an evidence snippet (`출처 링크 + 근거 스니펫 필수`).
- **core** — other candidates: only the core data source is target-verified; a
  `verified` badge needs a source but not the snippet.

### Guardrails

- `isEligibleForRecommendation(candidate)` — a candidate **cannot** be the default
  when it carries **any** prohibition tag, or when a verifiable dimension isn't fully
  verified. `⚠미검증`/`유료`/`존재 불확실` sources are dropped or downgraded
  (`feedback_no_unverified_negative_claims`: absence/inaccessibility is never
  asserted without verification — it's marked `⚠미검증가설`, not declared "없음").
- `recommendedCandidate(result)` — returns the pre-selected recommendation **only if**
  it is full-verified and eligible; otherwise `null`. When no edge is found,
  `edgeFound` is `false` and there is no auto-switch (SPEC §5.4 three-way branch).

## Audit-session store (`store.ts`)

This project has no SQL database — persistence is **file-based + in-memory mirror**,
matching `../track/store` and `../pipeline/artifactStore`. So the "audit_session
table" is an `AuditSession` record and the two new "columns" are typed fields:

| field | meaning |
|---|---|
| `selectedEdgeId` | the committed choice (recommendation accepted **or** override); `null` = undecided |
| `edgeMetadata` | the full `EdgeGateResult` so the interview can flow **엣지-aware** without re-running research |

`AuditSessionStore` is a JSON file with an in-memory map. Reads tolerate a corrupt
file by starting empty (Sane default + override); disk failures never crash a run.
`attachEdgeMetadata()` does **not** auto-commit a selection — facing the
recommendation is forced, accepting it is not (SPEC §5.4).

```ts
import { AuditSessionStore, recommendedCandidate } from "./edge/index.js";

const store = new AuditSessionStore();
const session = store.create("sess-1", "AI 주식 타이밍 알리미", new Date().toISOString());

// after the gate pipeline (later task) produces an EdgeGateResult:
store.attachEdgeMetadata(session.id, gateResult, new Date().toISOString());
const rec = recommendedCandidate(gateResult);          // null if none found (§5.4)

// user faces the card and commits (recommendation or informed override):
store.selectEdge(session.id, rec?.id ?? null, new Date().toISOString());
```

## Backend pipeline (Task 2 — `scout.ts`, `prompt.ts`, `service.ts`, `handler.ts`)

`POST /api/audit-session/{id}/edge-gate` runs the whole gate automatically (SPEC §5.2):

```
idea+domain → Scout research → LLM 후보 2~3 → 4차원 평가 → 풀검증 1개 추천 → freeze on session
```

1. **Scout** (`ScoutClient`) — web search + **24h TTL cache** (reuses `../market/cache`
   `TtlCache`, no duplicate infra). `research()` seeds candidate generation;
   `verifyDataSource()` turns "does this free/public source exist?" into a
   `VerificationResult` with a **source link + snippet**. The `WebSearch` backend is
   injectable; the default `NullWebSearch` returns nothing, so with **no search
   backend wired the honest result is `has_edge_candidate=false`** — facts are marked
   `⚠미검증가설`, never asserted absent.
2. **Generation** (`prompt.ts`) — the LLM proposes 2–3 candidates (data source +
   automation pipeline) and scores **only** the two judgment dimensions
   (buildDifficulty, defensibility, 1–5 + reasoning). Prompt-enforced JSON, parsed
   defensively (`parseRawCandidates`). Provider chain reuses `../llm` (Anthropic
   primary, Gemini fallback by load).
3. **Evaluation + selection** (`EdgeGateService.run`) — builds the 4-dimension table,
   verifies existence at **core** depth for all candidates, ranks the
   prohibition-clean + existence-verified pool by score, then promotes the best to
   **full** verification (existence + cost, with source + snippet). The first that
   fully qualifies becomes the single recommendation (`recommended=true`,
   `verificationLevel="full"`). Two-tier cost split honored: only the promoted
   candidate pays the cost search (SPEC §5.3).
4. **Prohibition filtering** — abstract-AI (no concrete source), paid/exclusive
   (위성·유료·독점), and unverified sources are tagged and **can never** be the
   default recommendation; paid-only search evidence downgrades to `⚠`.
5. **Handler** (`handler.ts`) — creates/loads the audit session, runs the gate,
   **freezes** the result onto `edge_metadata` (does NOT auto-select — facing forced,
   accepting not, SPEC §5.4), and returns `{ has_edge_candidate, recommended_edge_id,
   pre_selected_edge, candidates[].pre_selected, … }`. Infra failure (no LLM provider)
   → **502**, distinct from a genuine "no edge" **200** (BinDesk: 시스템이 진단한다).

Wired into the zero-dep API server via `routePost` (`../api/handlers`, `../api/server`
now accepts `POST` with a capped JSON body reader).

## Selection save + SPEC injection (Task 4 — `selection.ts`, `specInterview.ts`, `auditLog.ts`)

When the user acts on the blocking card, the gate→interview transition runs:

```
POST /api/audit-session/{id}/edge-gate/select   { action: accept|override|skip, edgeId? }
   → commit selection (freeze 데이터소스·파이프라인·평가 snapshot onto selected_edge)
   → status edge_gate → spec_interview
   → audit_log: edge_gate_selected | edge_gate_overridden | edge_gate_skipped (+ spec_interview_started)
   → return edge-aware questions (SPEC §5.1)

POST /api/audit-session/{id}/spec-interview/answers   { answers: {questionId, answer}[] }
   → embed chosen edge + answers into final SPEC §5.6 markdown
   → status spec_interview → spec_finalized
   → audit_log: spec_finalized
```

- **`store.ts`** gains `status` (`edge_gate`/`spec_interview`/`spec_finalized`), a frozen
  `selectedEdge` snapshot, and `specInterview` state, plus `commitSelection` /
  `setSpecInterview`. Old records are status-backfilled on load (Sane default).
- **`specInterview.ts`** (pure) — `buildEdgeAwareQuestions(edge)` injects the concrete
  `[데이터소스]`+`[파이프라인]` into the prompts ("이 'DART 공시 RSS' 를 '매일 크롤·정규화'
  파이프라인에서 어떻게 활용하실 건가요?"); `embedEdgeInSpec(edge, answers)` renders the
  SPEC §5.6 "본 앱 채택 엣지" table + Q/A (unanswered shown as "(미응답)", never dropped).
- **`auditLog.ts`** — append-only JSONL audit trail (modeled on `../track/store`),
  idempotent by `(session, type, at)`, corrupt-line-tolerant.
- **`selection.ts`** — `EdgeSelectionService` orchestrates commit/skip/submitAnswers over
  the injected stores; refuses an `edgeId` not present in the gate result (never
  fabricate a selection).

The client drives this via `mobile/src/flow/specInterview.ts`
(`runEdgeGate` / `submitEdgeSelection` / `submitCustomEdge` / `submitSpecAnswers`),
sequenced by the **audit-flow state machine** `mobile/src/state/auditSession.ts`
(Phase 77 → `edge_gate` → `spec_interview` → `spec_finalized`) and rendered by
`mobile/src/flow/AuditFlow.tsx`. The state machine applies an **optimistic** phase
jump on selection and **rolls back** (surfacing the error) if the request fails.

## §5.4 미발견/Override 분기 (Task 5 — `customEdge.ts`, fallback action)

When the gate returns `has_edge_candidate=false` (0 candidates, or all ⚠/❌), the same
`select` endpoint serves a **three-way branch** (the client renders
`mobile/src/components/EdgeGateFallback.tsx`):

| 분기 | action | server |
|---|---|---|
| ① 제공된 후보에서 선택 (있으면) | `override` + `edgeId` | informed override over a dropped/⚠ candidate → audited `edge_gate_overridden` |
| ② 직접 엣지 입력 (텍스트) | `custom` + `text` | `validateCustomEdge` → `extractEdgeKeywords` → synthesize a `userProvided` (UNVERIFIED) candidate → audited `edge_gate_custom`; returns extracted `keywords` |
| ③ 엣지 스킵 진행 (일반 SPEC) | `skip` | proceed with no edge → audited `edge_gate_skipped` |

- **`customEdge.ts`** (pure) — `validateCustomEdge` (non-empty + min length, Korean
  reason), `extractEdgeKeywords` (Unicode tokenize, strip Korean particles + stopwords,
  coarse 데이터소스/파이프라인 split on a separator), `buildCustomCandidate` (verifiable
  dims marked **unverified** — a user-typed edge is never shown as machine-verified;
  `userProvided: true` keeps provenance honest).
- Invalid custom text → **400** (recoverable, distinct from a 404 missing-session).

## Tests

- `edge/__tests__/selection.test.ts` — accept saves snapshot + transitions + logs
  `edge_gate_selected` + returns injected questions; override logs `edge_gate_overridden`;
  skip → no edge/questions + `edge_gate_skipped`; unknown edge id / missing session throw;
  `submitAnswers` embeds §5.6 + finalizes (shows "(미응답)") and throws after a skip.
- `edge/__tests__/auditLog.test.ts` — record/read by session, idempotency, append-only
  file persistence + corrupt-line skip.
- `edge/__tests__/edge.test.ts` — guardrails + `AuditSessionStore` (Task 1): clean
  candidate eligible; any prohibition tag or unverified verifiable dimension
  disqualifies; full needs source+snippet, core needs source only; `recommendedCandidate`
  null when not found / ineligible; store null edge columns on create, idempotent
  create, attach without auto-commit, informed override, missing-session throw, file
  persistence + corrupt-file resilience.
- `edge/__tests__/service.test.ts` — generation→full-verify→single recommendation (best
  score wins); honest `edgeFound=false` with `NullWebSearch`; abstract-AI tagged + dropped
  despite a perfect score; paid/exclusive downgraded + never recommended; `LlmError` on
  no provider; `candidateScore` sums the judgment scores.
- `edge/__tests__/handler.test.ts` — route match/extract; 400 on missing idea; 200 with
  `pre_selected` recommendation + `edge_metadata` frozen (selection not auto-committed);
  200 `has_edge_candidate=false` when nothing verifies; 502 on infra failure.
