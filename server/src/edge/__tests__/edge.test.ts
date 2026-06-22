import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isEligibleForRecommendation,
  verificationIsComplete,
  recommendedCandidate,
  dimensionOf,
} from "../types.js";
import type { EdgeCandidate, EdgeGateResult, VerificationResult } from "../types.js";
import { AuditSessionStore } from "../store.js";

function fullVerified(extra?: Partial<VerificationResult>): VerificationResult {
  return {
    level: "full",
    badge: "verified",
    verified: true,
    sourceUrl: "https://example.com/source",
    snippet: "무료 일봉 5년 데이터 제공",
    via: "web-search",
    checkedAt: "2026-06-22T00:00:00.000Z",
    ...extra,
  };
}

/** A clean, fully-verified recommendation candidate. */
function recommendedCand(): EdgeCandidate {
  return {
    id: "edge-1",
    title: "흩어진 무료 공시 묶기",
    dataSource: "거래소 RSS 공시 피드",
    automationPipeline: "매일 크롤·정규화해 종목별 타임라인으로 엮기",
    verificationLevel: "full",
    prohibitionTags: [],
    recommended: true,
    recommendationReason: "무료 소스 검증됨 + 실행 노가다가 해자",
    dimensions: [
      { key: "dataExistence", nature: "verifiable", assessment: "검증됨", verification: fullVerified() },
      { key: "buildDifficulty", nature: "judgment", assessment: "이 개발자 가능" },
      { key: "defensibility", nature: "judgment", assessment: "유지보수 노가다 해자" },
      { key: "dataCost", nature: "verifiable", assessment: "무료 티어 확인", verification: fullVerified() },
    ],
  };
}

describe("edge gate guardrails (SPEC §5.3)", () => {
  it("a clean, full-verified candidate is eligible to be the default recommendation", () => {
    expect(isEligibleForRecommendation(recommendedCand())).toBe(true);
  });

  it("any prohibition tag disqualifies the default recommendation", () => {
    const c = recommendedCand();
    c.prohibitionTags = ["PaidExclusive"];
    expect(isEligibleForRecommendation(c)).toBe(false);
  });

  it("an unverified verifiable dimension cannot be the default (no unverified claims)", () => {
    const c = recommendedCand();
    const dim = dimensionOf(c, "dataExistence")!;
    dim.verification = { level: "full", badge: "unverified", verified: false };
    expect(isEligibleForRecommendation(c)).toBe(false);
  });

  it("full verification requires both a source link AND a snippet", () => {
    expect(verificationIsComplete(fullVerified())).toBe(true);
    expect(verificationIsComplete(fullVerified({ snippet: undefined }))).toBe(false);
    expect(verificationIsComplete(fullVerified({ sourceUrl: undefined }))).toBe(false);
  });

  it("core verification needs a source but not a snippet", () => {
    const core: VerificationResult = { level: "core", badge: "verified", verified: true, sourceUrl: "u" };
    expect(verificationIsComplete(core)).toBe(true);
    expect(verificationIsComplete({ ...core, sourceUrl: undefined })).toBe(false);
  });

  it("recommendedCandidate returns null when no edge was found (§5.4 no auto-switch)", () => {
    const result: EdgeGateResult = {
      candidates: [],
      recommendedEdgeId: null,
      edgeFound: false,
      researchedAt: "2026-06-22T00:00:00.000Z",
      notFoundReason: "무료 소스 미확인",
    };
    expect(recommendedCandidate(result)).toBeNull();
  });

  it("recommendedCandidate rejects a pointer to an ineligible candidate", () => {
    const tainted = recommendedCand();
    tainted.prohibitionTags = ["Unverified"];
    const result: EdgeGateResult = {
      candidates: [tainted],
      recommendedEdgeId: tainted.id,
      edgeFound: true,
      researchedAt: "2026-06-22T00:00:00.000Z",
    };
    expect(recommendedCandidate(result)).toBeNull();
  });

  it("recommendedCandidate returns the valid pre-selected recommendation", () => {
    const c = recommendedCand();
    const result: EdgeGateResult = {
      candidates: [c],
      recommendedEdgeId: c.id,
      edgeFound: true,
      researchedAt: "2026-06-22T00:00:00.000Z",
    };
    expect(recommendedCandidate(result)?.id).toBe("edge-1");
  });
});

describe("AuditSessionStore (in-memory)", () => {
  const now = "2026-06-22T00:00:00.000Z";

  it("creates a session with null edge-gate columns and is idempotent by id", () => {
    const s = new AuditSessionStore({ file: null });
    const a = s.create("sess-1", "주식 알리미", now);
    expect(a.selectedEdgeId).toBeNull();
    expect(a.edgeMetadata).toBeNull();
    // re-create returns the same record, does not reset fields
    s.selectEdge("sess-1", "edge-1", now);
    expect(s.create("sess-1", "다른 요약", now).selectedEdgeId).toBe("edge-1");
  });

  it("attaches edge metadata without auto-committing a selection (§5.4)", () => {
    const s = new AuditSessionStore({ file: null });
    s.create("sess-1", "주식 알리미", now);
    const meta: EdgeGateResult = {
      candidates: [recommendedCand()],
      recommendedEdgeId: "edge-1",
      edgeFound: true,
      researchedAt: now,
    };
    const updated = s.attachEdgeMetadata("sess-1", meta, now);
    expect(updated.edgeMetadata?.recommendedEdgeId).toBe("edge-1");
    expect(updated.selectedEdgeId).toBeNull(); // facing forced, accepting not
  });

  it("records an informed override (selecting a non-recommended edge or none)", () => {
    const s = new AuditSessionStore({ file: null });
    s.create("sess-1", "주식 알리미", now);
    expect(s.selectEdge("sess-1", "edge-2", now).selectedEdgeId).toBe("edge-2");
    expect(s.selectEdge("sess-1", null, now).selectedEdgeId).toBeNull();
  });

  it("throws when mutating a missing session", () => {
    const s = new AuditSessionStore({ file: null });
    expect(() => s.selectEdge("nope", "edge-1", now)).toThrow(/not found/);
  });
});

describe("AuditSessionStore (file persistence)", () => {
  const file = join(tmpdir(), `audit-test-${Math.random().toString(36).slice(2)}.json`);
  const now = "2026-06-22T00:00:00.000Z";
  afterEach(() => {
    if (existsSync(file)) rmSync(file);
  });

  it("persists across instances and survives a corrupt file", () => {
    const s1 = new AuditSessionStore({ file });
    s1.create("sess-1", "주식 알리미", now);
    s1.selectEdge("sess-1", "edge-1", now);

    const s2 = new AuditSessionStore({ file });
    expect(s2.get("sess-1")?.selectedEdgeId).toBe("edge-1");

    // Corrupt the file → a fresh instance starts empty rather than crashing.
    writeFileSync(file, "{ not json", "utf8");
    expect(new AuditSessionStore({ file }).readAll()).toEqual([]);
  });
});
