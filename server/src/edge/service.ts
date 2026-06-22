/**
 * Edge gate backend service (SPEC §5.2 — the automatic pipeline; Task 2/7).
 *
 * Given an idea + domain, this orchestrates the whole gate without user input:
 *   1. Scout domain research (web search + 24h cache) — reuse, no duplicate infra.
 *   2. Generate 2–3 candidate edges via the LLM (data source + automation pipeline).
 *   3. Build the 4-dimension table: buildDifficulty + defensibility from the LLM
 *      (judgment, no search); dataExistence + dataCost from Scout (verifiable facts).
 *   4. Select ONE recommendation = highest-scored candidate that passes FULL
 *      verification (existence + free cost, with source + snippet), mark recommended.
 *   5. If none qualifies → has_edge_candidate=false (SPEC §5.4: no auto-switch).
 * Prohibition filtering (SPEC §5.2/§5.3): abstract-AI / paid-exclusive / unverified
 * sources are tagged and can never be the default recommendation.
 *
 * The two-tier verification cost split (SPEC §5.3) is honored: only the candidate
 * being promoted to the recommendation pays the full cost search; the rest get just
 * the core data-source existence check.
 */

import { extractJsonObject, LlmError, type LlmProvider } from "../llm/types.js";
import { defaultProviders, orderProviders } from "../llm/generator.js";
import { ScoutClient } from "./scout.js";
import {
  buildEdgeUserPrompt,
  EDGE_SYSTEM_PROMPT,
  parseRawCandidates,
  type RawCandidate,
} from "./prompt.js";
import {
  dimensionOf,
  verificationIsComplete,
  type DimensionEvaluation,
  type EdgeCandidate,
  type EdgeGateResult,
  type ProhibitionTag,
  type VerificationResult,
} from "./types.js";

/** Abstract-AI framing (no concrete data source) — SPEC §5.2 prohibition. */
const ABSTRACT_AI =
  /(^|[^a-z])(ai|llm|gpt|chatgpt)([^a-z]|$)|인공지능|머신러닝|딥러닝/i;
/** A concrete-source signal that rescues an otherwise AI-sounding description. */
const CONCRETE_SOURCE = /(api|rss|피드|feed|공시|disclosure|크롤|crawl|데이터셋|dataset|csv|json|filing|sec|dart|exchange|거래소|뉴스|news)/i;
/** Paid/proprietary/expensive data signals — SPEC §5.2 prohibition. */
const PAID_EXCLUSIVE =
  /\b(satellite|paid|premium|proprietary|licensed?)\b|위성|카드\s*결제|유료|독점|라이선스/i;

export interface EdgeGateServiceOptions {
  scout?: ScoutClient;
  providers?: LlmProvider[];
  /** Current server load 0..1 (provider ordering). Default 0. */
  load?: number;
  loadThreshold?: number;
  maxTokens?: number;
  /** Injectable clock (ISO string). */
  now?: () => string;
  /** Candidate id generator; default `edge-1`, `edge-2`, … */
  idGen?: (index: number) => string;
}

export class EdgeGateService {
  private readonly scout: ScoutClient;
  private readonly providers: LlmProvider[];
  private readonly load: number;
  private readonly loadThreshold: number;
  private readonly maxTokens?: number;
  private readonly now: () => string;
  private readonly idGen: (i: number) => string;

  constructor(opts: EdgeGateServiceOptions = {}) {
    this.scout = opts.scout ?? new ScoutClient();
    this.providers = opts.providers ?? defaultProviders();
    this.load = opts.load ?? 0;
    this.loadThreshold = opts.loadThreshold ?? 0.8;
    this.maxTokens = opts.maxTokens;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.idGen = opts.idGen ?? ((i) => `edge-${i + 1}`);
  }

  /**
   * Run the full gate for one idea. Throws {@link LlmError} only on an infra failure
   * (no provider configured / every provider failed to produce candidates) — that is
   * a system fault, distinct from "no eligible edge in this domain" which is reported
   * as `edgeFound: false` (SPEC §5.4).
   */
  async run(idea: string, domain = ""): Promise<EdgeGateResult> {
    const research = await this.scout.research(idea, domain);
    const raws = await this.generateCandidates(idea, domain, research);

    // Phase A — build every candidate at CORE depth (existence verified, cost not yet).
    const candidates: EdgeCandidate[] = [];
    for (let i = 0; i < raws.length; i++) {
      candidates.push(await this.buildCoreCandidate(this.idGen(i), raws[i]!));
    }

    // Phase B — rank candidates that could legally become the recommendation:
    // no disqualifying tag AND a verified (free/public) data source.
    const considerable = candidates
      .filter((c) => c.prohibitionTags.length === 0 && existenceVerified(c))
      .sort((a, b) => candidateScore(b) - candidateScore(a));

    // Phase C — promote the best to FULL verification (also verify cost). Try the
    // next-best if cost can't be verified; stop at the first that fully qualifies.
    let recommendedId: string | null = null;
    for (const cand of considerable) {
      const promoted = await this.promoteToFull(cand);
      if (verificationIsComplete(dimensionOf(promoted, "dataExistence")?.verification) &&
          verificationIsComplete(dimensionOf(promoted, "dataCost")?.verification)) {
        promoted.recommended = true;
        promoted.verificationLevel = "full";
        promoted.recommendationReason = recommendationReason(promoted);
        recommendedId = promoted.id;
        replaceById(candidates, promoted);
        break;
      }
      // cost couldn't be verified → keep it as a non-recommended core candidate
      replaceById(candidates, promoted);
    }

    const edgeFound = recommendedId !== null;
    return {
      candidates,
      recommendedEdgeId: recommendedId,
      edgeFound,
      researchedAt: this.now(),
      ...(edgeFound
        ? {}
        : { notFoundReason: "무료·공개·접근 가능한 데이터 소스를 검증하지 못했습니다." }),
    };
  }

  /** Run the LLM provider chain to get raw candidates; throws on total failure. */
  private async generateCandidates(
    idea: string,
    domain: string,
    research: Awaited<ReturnType<ScoutClient["research"]>>,
  ): Promise<RawCandidate[]> {
    const ordered = orderProviders(this.providers, this.load, this.loadThreshold);
    if (ordered.length === 0) {
      throw new LlmError(
        "No LLM provider is configured. Set ANTHROPIC_API_KEY (and optionally GEMINI_API_KEY).",
      );
    }
    const user = buildEdgeUserPrompt(idea, domain, research);
    const causes: unknown[] = [];
    for (const provider of ordered) {
      try {
        const completion = await provider.complete({
          system: EDGE_SYSTEM_PROMPT,
          user,
          maxTokens: this.maxTokens,
        });
        return parseRawCandidates(extractJsonObject(completion.text));
      } catch (err) {
        causes.push(err);
      }
    }
    throw new LlmError("all LLM providers failed to produce edge candidates", causes);
  }

  /** Build a candidate at CORE verification depth (existence searched, cost deferred). */
  private async buildCoreCandidate(id: string, raw: RawCandidate): Promise<EdgeCandidate> {
    const tags = new Set<ProhibitionTag>();
    const combined = `${raw.dataSource} ${raw.automationPipeline}`;
    if (ABSTRACT_AI.test(combined) && !CONCRETE_SOURCE.test(combined)) tags.add("AbstractAI");
    if (PAID_EXCLUSIVE.test(combined)) tags.add("PaidExclusive");

    const existence = await this.scout.verifyDataSource(raw.dataSource, "core");
    if (existence.badge === "warn") tags.add("PaidExclusive"); // paid-only evidence
    if (existence.badge === "unverified") tags.add("Unverified");

    const dimensions: DimensionEvaluation[] = [
      { key: "dataExistence", nature: "verifiable", assessment: existenceAssessment(existence), verification: existence },
      { key: "buildDifficulty", nature: "judgment", assessment: raw.buildDifficulty.assessment, score: raw.buildDifficulty.score },
      { key: "defensibility", nature: "judgment", assessment: raw.defensibility.assessment, score: raw.defensibility.score },
      {
        key: "dataCost",
        nature: "verifiable",
        assessment: "비용 미검증 — 추천 후보로 승격 시 풀검증합니다.",
        verification: { level: "core", badge: "unverified", verified: false, checkedAt: this.now() },
      },
    ];

    return {
      id,
      title: raw.title,
      dataSource: raw.dataSource,
      automationPipeline: raw.automationPipeline,
      dimensions,
      verificationLevel: "core",
      prohibitionTags: [...tags],
      recommended: false,
    };
  }

  /**
   * Promote a candidate to FULL verification: re-verify existence at full depth (so
   * it carries source + snippet) and verify the data cost (free tier). Returns a new
   * candidate object; the caller decides whether it qualifies as the recommendation.
   */
  private async promoteToFull(cand: EdgeCandidate): Promise<EdgeCandidate> {
    const existence = await this.scout.verifyDataSource(cand.dataSource, "full");
    const cost = await this.scout.verifyDataSource(`${cand.dataSource} free tier 무료 요금`, "full");
    const tags = new Set<ProhibitionTag>(cand.prohibitionTags);
    if (existence.badge === "unverified") tags.add("Unverified");
    if (existence.badge === "warn" || cost.badge === "warn") tags.add("PaidExclusive");

    const dimensions = cand.dimensions.map((d): DimensionEvaluation => {
      if (d.key === "dataExistence") {
        return { ...d, assessment: existenceAssessment(existence), verification: existence };
      }
      if (d.key === "dataCost") {
        return { ...d, assessment: costAssessment(cost), verification: cost };
      }
      return d;
    });

    return { ...cand, dimensions, verificationLevel: "full", prohibitionTags: [...tags] };
  }
}

/** Default service wired from environment (Anthropic + Gemini, NullWebSearch Scout). */
export function defaultEdgeGateService(): EdgeGateService {
  return new EdgeGateService();
}

// --- pure helpers (exported where useful for testing) ---

/** True when a candidate's data-existence dimension is a verified, complete fact. */
export function existenceVerified(c: EdgeCandidate): boolean {
  return verificationIsComplete(dimensionOf(c, "dataExistence")?.verification);
}

/**
 * Recommendation score = the two LLM judgment scores summed (feasibility +
 * defensibility, each 1–5; SPEC §5.3). Missing scores default to the neutral 3 so a
 * candidate is never ranked at zero just because the model omitted a number.
 */
export function candidateScore(c: EdgeCandidate): number {
  const diff = dimensionOf(c, "buildDifficulty")?.score ?? 3;
  const def = dimensionOf(c, "defensibility")?.score ?? 3;
  return diff + def;
}

function existenceAssessment(v: VerificationResult): string {
  if (v.badge === "verified") return "무료·공개 데이터 소스 확인됨(출처·스니펫 첨부).";
  if (v.badge === "warn") return "유료·독점 신호가 감지되어 ⚠ 로 강등되었습니다.";
  return "검증 가능한 근거를 찾지 못했습니다(⚠미검증가설). 부재로 단정하지 않습니다.";
}

function costAssessment(v: VerificationResult): string {
  if (v.badge === "verified") return "무료 티어 존재 확인됨.";
  if (v.badge === "warn") return "유료 신호 감지 — ⚠.";
  return "무료 티어를 검증하지 못함(⚠).";
}

function recommendationReason(c: EdgeCandidate): string {
  const def = dimensionOf(c, "defensibility")?.assessment ?? "";
  return `무료·공개 데이터 소스가 풀검증되었고(${c.dataSource}), 방어성 근거: ${def}`.trim();
}

function replaceById(list: EdgeCandidate[], updated: EdgeCandidate): void {
  const i = list.findIndex((c) => c.id === updated.id);
  if (i >= 0) list[i] = updated;
}
