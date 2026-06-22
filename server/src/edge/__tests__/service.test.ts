import { describe, it, expect } from "vitest";
import { EdgeGateService, candidateScore } from "../service.js";
import { ScoutClient, type WebSearch, type WebSearchResult } from "../scout.js";
import { recommendedCandidate } from "../types.js";
import { TtlCache } from "../../market/cache.js";
import type { LlmCompletion, LlmProvider, LlmRequest } from "../../llm/types.js";

/** Build a Scout with disk disabled (tests never touch .bindesk). */
function scout(search?: WebSearch): ScoutClient {
  return new ScoutClient({ search, cache: new TtlCache({ dir: null }), now });
}

/** A stub LLM provider that returns a fixed JSON payload. */
function stubProvider(payload: unknown, available = true): LlmProvider {
  return {
    name: "anthropic",
    isAvailable: () => available,
    async complete(_req: LlmRequest): Promise<LlmCompletion> {
      return { text: JSON.stringify(payload), model: "stub-model" };
    },
  };
}

/** A stub web search returning canned results per substring match. */
function stubSearch(rules: Array<{ match: RegExp; results: WebSearchResult[] }>): WebSearch {
  return {
    name: "stub",
    async search(query: string): Promise<WebSearchResult[]> {
      for (const r of rules) if (r.match.test(query)) return r.results;
      return [];
    },
  };
}

const TWO_CANDIDATES = {
  candidates: [
    {
      title: "거래소 RSS 공시 묶기",
      dataSource: "한국거래소 DART 공시 RSS 피드",
      automationPipeline: "매일 공시 RSS 를 크롤·정규화해 종목별 타임라인으로 엮는 파이프라인",
      buildDifficulty: { score: 4, assessment: "RSS 파싱은 익숙한 작업" },
      defensibility: { score: 5, assessment: "지속적 정규화·유지보수 노가다가 해자" },
    },
    {
      title: "느린 IR 일정 집계",
      dataSource: "상장사 IR 일정 공개 페이지",
      automationPipeline: "흩어진 IR 페이지를 매일 스크랩해 캘린더로 통합",
      buildDifficulty: { score: 3, assessment: "페이지마다 구조가 달라 다소 번거로움" },
      defensibility: { score: 3, assessment: "모방 가능하나 유지보수 비용 존재" },
    },
  ],
};

const FREE_HIT: WebSearchResult = {
  title: "DART OpenAPI — 무료 공개 데이터",
  url: "https://opendart.fss.or.kr",
  snippet: "전자공시 free public open data RSS, 무료 티어 제공",
};

const now = () => "2026-06-22T00:00:00.000Z";

describe("EdgeGateService.run", () => {
  it("generates candidates, full-verifies the best, and pre-selects ONE recommendation", async () => {
    const search = stubSearch([{ match: /DART|공시|free tier|무료/i, results: [FREE_HIT] }]);
    const svc = new EdgeGateService({
      providers: [stubProvider(TWO_CANDIDATES)],
      scout: scout(search),
      now,
    });

    const result = await svc.run("매일 공시 기반 추천", "주식");
    expect(result.edgeFound).toBe(true);
    expect(result.candidates).toHaveLength(2);

    const rec = recommendedCandidate(result);
    expect(rec).not.toBeNull();
    // The higher-scored DART candidate (4+5=9) beats the IR one (3+3=6).
    expect(rec!.dataSource).toContain("DART");
    expect(rec!.verificationLevel).toBe("full");
    expect(rec!.prohibitionTags).toEqual([]);
    expect(rec!.recommendationReason).toBeTruthy();

    // dataExistence is full-verified with a source link + snippet (SPEC §5.3).
    const existence = rec!.dimensions.find((d) => d.key === "dataExistence")!.verification!;
    expect(existence.badge).toBe("verified");
    expect(existence.sourceUrl).toBe(FREE_HIT.url);
    expect(existence.snippet).toBeTruthy();
  });

  it("returns has_edge_candidate=false when no source verifies (honest default)", async () => {
    // NullWebSearch (no results) → every existence check is ⚠미검증가설 → none eligible.
    const svc = new EdgeGateService({
      providers: [stubProvider(TWO_CANDIDATES)],
      scout: scout(),
      now,
    });
    const result = await svc.run("매일 공시 기반 추천", "주식");
    expect(result.edgeFound).toBe(false);
    expect(result.recommendedEdgeId).toBeNull();
    expect(result.notFoundReason).toBeTruthy();
    expect(recommendedCandidate(result)).toBeNull();
  });

  it("tags an abstract-AI edge and drops it from the recommendation", async () => {
    const payload = {
      candidates: [
        {
          title: "그냥 AI 로 분석",
          dataSource: "AI",
          automationPipeline: "LLM 으로 종목을 분석",
          buildDifficulty: { score: 5, assessment: "쉬움" },
          defensibility: { score: 5, assessment: "강함" },
        },
        TWO_CANDIDATES.candidates[0],
      ],
    };
    const search = stubSearch([{ match: /DART|공시|free tier|무료/i, results: [FREE_HIT] }]);
    const svc = new EdgeGateService({ providers: [stubProvider(payload)], scout: scout(search), now });
    const result = await svc.run("아이디어", "주식");
    const abstract = result.candidates.find((c) => c.dataSource === "AI")!;
    expect(abstract.prohibitionTags).toContain("AbstractAI");
    // Despite a perfect 5+5 score, the abstract edge can't be the recommendation.
    expect(result.recommendedEdgeId).not.toBe(abstract.id);
    expect(recommendedCandidate(result)?.dataSource).toContain("DART");
  });

  it("downgrades a paid/exclusive source to ⚠ and never recommends it", async () => {
    const payload = {
      candidates: [
        {
          title: "위성 영상 분석",
          dataSource: "유료 위성 영상 데이터셋",
          automationPipeline: "위성 이미지를 매일 받아 주차장 점유율 추정",
          buildDifficulty: { score: 4, assessment: "가능" },
          defensibility: { score: 5, assessment: "강함" },
        },
      ],
    };
    const svc = new EdgeGateService({ providers: [stubProvider(payload)], scout: scout(), now });
    const result = await svc.run("아이디어", "주식");
    const paid = result.candidates[0]!;
    expect(paid.prohibitionTags).toContain("PaidExclusive");
    expect(result.edgeFound).toBe(false);
  });

  it("throws LlmError when no provider is configured (infra fault, not 'no edge')", async () => {
    const svc = new EdgeGateService({ providers: [], scout: scout(), now });
    await expect(svc.run("아이디어", "주식")).rejects.toThrow(/provider/i);
  });
});

describe("candidateScore", () => {
  it("sums the two judgment scores", async () => {
    const search = stubSearch([{ match: /./, results: [FREE_HIT] }]);
    const svc = new EdgeGateService({ providers: [stubProvider(TWO_CANDIDATES)], scout: scout(search), now });
    const result = await svc.run("아이디어", "주식");
    const dart = result.candidates.find((c) => c.dataSource.includes("DART"))!;
    expect(candidateScore(dart)).toBe(9); // 4 + 5
  });
});
