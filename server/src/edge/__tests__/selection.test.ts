import { describe, it, expect } from "vitest";
import { EdgeSelectionService, CustomEdgeError } from "../selection.js";
import { AuditSessionStore } from "../store.js";
import { AuditLogStore } from "../auditLog.js";
import { buildEdgeAwareQuestions, embedEdgeInSpec } from "../specInterview.js";
import type { EdgeCandidate, EdgeGateResult } from "../types.js";

const now = () => "2026-06-22T00:00:00.000Z";

function edge(id: string, recommended = false): EdgeCandidate {
  return {
    id,
    title: `엣지 ${id}`,
    dataSource: "DART 공시 RSS 피드",
    automationPipeline: "매일 공시 RSS 크롤·정규화",
    verificationLevel: recommended ? "full" : "core",
    prohibitionTags: [],
    recommended,
    recommendationReason: recommended ? "무료 소스 풀검증됨" : undefined,
    dimensions: [
      {
        key: "dataExistence",
        nature: "verifiable",
        assessment: "확인됨",
        verification: { level: "full", badge: "verified", verified: true, sourceUrl: "https://opendart.fss.or.kr", snippet: "무료 공개 RSS" },
      },
      { key: "buildDifficulty", nature: "judgment", assessment: "RSS 익숙", score: 4 },
      { key: "defensibility", nature: "judgment", assessment: "유지보수 노가다 해자", score: 5 },
      { key: "dataCost", nature: "verifiable", assessment: "무료", verification: { level: "full", badge: "verified", verified: true, sourceUrl: "u", snippet: "무료 티어" } },
    ],
  };
}

function gateResult(): EdgeGateResult {
  return {
    candidates: [edge("edge-1", true), edge("edge-2")],
    recommendedEdgeId: "edge-1",
    edgeFound: true,
    researchedAt: now(),
  };
}

function setup() {
  const sessions = new AuditSessionStore({ file: null });
  const auditLog = new AuditLogStore({ file: null });
  const svc = new EdgeSelectionService(sessions, auditLog, now);
  sessions.create("sess-1", "주식 알리미", now());
  sessions.attachEdgeMetadata("sess-1", gateResult(), now());
  return { sessions, auditLog, svc };
}

describe("EdgeSelectionService.commit", () => {
  it("accept: saves selected edge snapshot, transitions to spec_interview, logs event, returns questions", () => {
    const { sessions, auditLog, svc } = setup();
    const { session, interview } = svc.commit("sess-1", "accept", "edge-1");

    expect(session.selectedEdgeId).toBe("edge-1");
    expect(session.selectedEdge?.dataSource).toBe("DART 공시 RSS 피드"); // 메타데이터 snapshot
    expect(session.status).toBe("spec_interview");

    // edge-aware questions injected with the data source + pipeline
    expect(interview?.questions).toHaveLength(3);
    expect(interview?.questions[0]?.prompt).toContain("DART 공시 RSS 피드");
    expect(interview?.questions[0]?.prompt).toContain("매일 공시 RSS 크롤·정규화");

    // audit_log edge_gate_selected event recorded
    const events = auditLog.readBySession("sess-1").map((e) => e.type);
    expect(events).toContain("edge_gate_selected");
    expect(events).toContain("spec_interview_started");
  });

  it("override: logs edge_gate_overridden for a non-recommended candidate", () => {
    const { auditLog, svc } = setup();
    const { session } = svc.commit("sess-1", "override", "edge-2");
    expect(session.selectedEdgeId).toBe("edge-2");
    expect(auditLog.readBySession("sess-1").map((e) => e.type)).toContain("edge_gate_overridden");
  });

  it("skip: no edge, no questions, logs edge_gate_skipped", () => {
    const { auditLog, svc } = setup();
    const { session, interview } = svc.commit("sess-1", "skip", null);
    expect(session.selectedEdgeId).toBeNull();
    expect(session.selectedEdge).toBeNull();
    expect(session.status).toBe("spec_interview");
    expect(interview).toBeNull();
    expect(auditLog.readBySession("sess-1").map((e) => e.type)).toContain("edge_gate_skipped");
  });

  it("throws when the edge id is not in the gate result (never fabricate)", () => {
    const { svc } = setup();
    expect(() => svc.commit("sess-1", "accept", "edge-999")).toThrow(/not found/);
  });

  it("throws on a missing session", () => {
    const { svc } = setup();
    expect(() => svc.commit("nope", "accept", "edge-1")).toThrow(/not found/);
  });
});

describe("EdgeSelectionService.submitCustomEdge (§5.4 직접 입력)", () => {
  it("validates text, extracts keywords, commits a user-provided edge, logs edge_gate_custom", () => {
    const { sessions, auditLog, svc } = setup();
    const { session, interview, extracted } = svc.submitCustomEdge(
      "sess-1",
      "거래소 공시 RSS → 매일 크롤·정규화 타임라인",
    );

    expect(session.status).toBe("spec_interview");
    expect(session.selectedEdge?.userProvided).toBe(true);
    expect(session.selectedEdgeId).toBe("edge-custom");
    expect(extracted?.keywords).toContain("공시");

    // edge-aware questions injected from the custom data source + pipeline
    expect(interview?.questions[0]?.prompt).toContain("거래소 공시 RSS");

    const events = auditLog.readBySession("sess-1").map((e) => e.type);
    expect(events).toContain("edge_gate_custom");
    expect(events).toContain("spec_interview_started");
    // sanity: the persisted snapshot survives a re-read
    expect(sessions.get("sess-1")?.selectedEdge?.automationPipeline).toBe("매일 크롤·정규화 타임라인");
  });

  it("throws CustomEdgeError on invalid text", () => {
    const { svc } = setup();
    expect(() => svc.submitCustomEdge("sess-1", "")).toThrow(CustomEdgeError);
  });

  it("works even when the gate found no candidates (fallback path)", () => {
    const sessions = new AuditSessionStore({ file: null });
    const auditLog = new AuditLogStore({ file: null });
    const svc = new EdgeSelectionService(sessions, auditLog, now);
    sessions.create("s-empty", "주식", now());
    sessions.attachEdgeMetadata(
      "s-empty",
      { candidates: [], recommendedEdgeId: null, edgeFound: false, researchedAt: now(), notFoundReason: "없음" },
      now(),
    );

    const { session } = svc.submitCustomEdge("s-empty", "거래소 공시 RSS 묶기");
    expect(session.selectedEdge?.userProvided).toBe(true);
    expect(session.status).toBe("spec_interview");
  });
});

describe("EdgeSelectionService.submitAnswers", () => {
  it("embeds the chosen edge + answers into final SPEC §5.6 and finalizes", () => {
    const { sessions, auditLog, svc } = setup();
    svc.commit("sess-1", "accept", "edge-1");

    const { session, interview } = svc.submitAnswers("sess-1", [
      { questionId: "edge-usage", answer: "공시를 종목별 타임라인으로 보여줍니다." },
      { questionId: "edge-defensibility", answer: "매일 파서를 점검합니다." },
    ]);

    expect(session.status).toBe("spec_finalized");
    expect(interview?.embeddedSpec).toContain("### 5.6 본 앱 채택 엣지");
    expect(interview?.embeddedSpec).toContain("공시를 종목별 타임라인으로 보여줍니다.");
    // unanswered question is shown honestly, not dropped
    expect(interview?.embeddedSpec).toContain("(미응답)");
    expect(sessions.get("sess-1")?.specInterview?.embeddedSpec).toBeTruthy();
    expect(auditLog.readBySession("sess-1").map((e) => e.type)).toContain("spec_finalized");
  });

  it("throws if there is no edge-framed interview (e.g. user skipped)", () => {
    const { svc } = setup();
    svc.commit("sess-1", "skip", null);
    expect(() => svc.submitAnswers("sess-1", [])).toThrow(/no edge-framed interview/);
  });
});

describe("specInterview pure helpers", () => {
  it("buildEdgeAwareQuestions injects the data source + pipeline", () => {
    const qs = buildEdgeAwareQuestions(edge("e", true));
    expect(qs.every((q) => q.edgeAware)).toBe(true);
    expect(qs[0]?.prompt).toContain("DART 공시 RSS 피드");
  });

  it("embedEdgeInSpec renders dimensions + answers and escapes pipes", () => {
    const md = embedEdgeInSpec(edge("e", true), [{ questionId: "edge-usage", answer: "활용" }]);
    expect(md).toContain("| 데이터 비용 |");
    expect(md).toContain("✓검증됨");
    expect(md).toContain("활용");
  });
});
