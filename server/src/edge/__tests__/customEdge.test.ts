import { describe, it, expect } from "vitest";
import { validateCustomEdge, extractEdgeKeywords, buildCustomCandidate } from "../customEdge.js";

const now = "2026-06-22T00:00:00.000Z";

describe("validateCustomEdge", () => {
  it("rejects empty / too-short text with a Korean reason", () => {
    expect(validateCustomEdge("").ok).toBe(false);
    expect(validateCustomEdge("   ").ok).toBe(false);
    expect(validateCustomEdge("a").ok).toBe(false);
    expect(validateCustomEdge("a").reason).toMatch(/구체적/);
  });
  it("accepts a sensible description", () => {
    expect(validateCustomEdge("거래소 공시 RSS 묶기").ok).toBe(true);
  });
});

describe("extractEdgeKeywords", () => {
  it("extracts keywords, dropping stopwords and particles", () => {
    const { keywords } = extractEdgeKeywords("거래소 공시 RSS를 매일 크롤해서 타임라인으로 묶기");
    expect(keywords).toContain("거래소");
    expect(keywords).toContain("공시");
    expect(keywords).toContain("rss"); // lowercased, particle 를 stripped
    expect(keywords).not.toContain("으로");
    expect(keywords.length).toBeLessThanOrEqual(8);
  });

  it("splits data source / pipeline on an explicit separator", () => {
    const e = extractEdgeKeywords("거래소 공시 RSS → 매일 크롤·정규화 타임라인");
    expect(e.dataSource).toBe("거래소 공시 RSS");
    expect(e.automationPipeline).toBe("매일 크롤·정규화 타임라인");
  });

  it("defaults the pipeline when there is no separator", () => {
    const e = extractEdgeKeywords("거래소 공시 데이터셋");
    expect(e.dataSource).toBe("거래소 공시 데이터셋");
    expect(e.automationPipeline).toMatch(/사용자 입력 파이프라인/);
  });
});

describe("buildCustomCandidate", () => {
  it("synthesizes an unverified, user-provided candidate (honest provenance)", () => {
    const { candidate } = buildCustomCandidate("거래소 공시 RSS → 매일 크롤", now);
    expect(candidate.userProvided).toBe(true);
    expect(candidate.id).toBe("edge-custom");
    expect(candidate.prohibitionTags).toEqual([]);
    // verifiable dims are explicitly UNVERIFIED — never claimed as verified
    const existence = candidate.dimensions.find((d) => d.key === "dataExistence")!;
    expect(existence.verification?.verified).toBe(false);
    expect(existence.verification?.badge).toBe("unverified");
  });
});
