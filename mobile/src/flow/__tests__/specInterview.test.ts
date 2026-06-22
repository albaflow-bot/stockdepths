import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { submitEdgeSelection, submitCustomEdge, submitSpecAnswers, EdgeFlowError } from "../specInterview";

const g = globalThis as unknown as { __API_BASE_URL__?: string; fetch?: unknown };

function mockFetch(impl: (url: string, init: RequestInit) => Partial<Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const r = impl(url, init);
    return { ok: true, status: 200, json: async () => ({}), ...r } as Response;
  });
  g.fetch = fn;
  return fn;
}

beforeEach(() => {
  g.__API_BASE_URL__ = "https://api.test";
});
afterEach(() => {
  delete g.__API_BASE_URL__;
  delete g.fetch;
  vi.restoreAllMocks();
});

describe("submitEdgeSelection", () => {
  it("POSTs the action + edgeId and normalizes the snake_case response", async () => {
    const fetchMock = mockFetch(() => ({
      json: async () => ({
        session_id: "sess-1",
        status: "spec_interview",
        selected_edge_id: "edge-1",
        questions: [{ id: "edge-usage", prompt: "어떻게 활용?", edgeAware: true }],
        embedded_spec: null,
      }),
    }));

    const res = await submitEdgeSelection("sess-1", "accept", "edge-1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.test/api/audit-session/sess-1/edge-gate/select");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ action: "accept", edgeId: "edge-1" });

    expect(res.status).toBe("spec_interview");
    expect(res.selectedEdgeId).toBe("edge-1");
    expect(res.questions).toHaveLength(1);
  });

  it("sends edgeId null for skip", async () => {
    const fetchMock = mockFetch(() => ({ json: async () => ({ session_id: "s", status: "spec_interview" }) }));
    await submitEdgeSelection("s", "skip", null);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ action: "skip", edgeId: null });
  });
});

describe("submitCustomEdge", () => {
  it("POSTs action=custom with the text and returns extracted keywords", async () => {
    const fetchMock = mockFetch(() => ({
      json: async () => ({
        session_id: "s",
        status: "spec_interview",
        selected_edge_id: "edge-custom",
        questions: [{ id: "edge-usage", prompt: "?", edgeAware: true }],
        keywords: ["공시", "rss"],
      }),
    }));
    const res = await submitCustomEdge("s", "거래소 공시 RSS → 매일 크롤");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/edge-gate/select");
    expect(JSON.parse(init.body as string)).toEqual({ action: "custom", text: "거래소 공시 RSS → 매일 크롤" });
    expect(res.keywords).toEqual(["공시", "rss"]);
    expect(res.selectedEdgeId).toBe("edge-custom");
  });
});

describe("submitSpecAnswers", () => {
  it("POSTs answers and returns the embedded SPEC markdown", async () => {
    const fetchMock = mockFetch(() => ({
      json: async () => ({ session_id: "s", status: "spec_finalized", embedded_spec: "### 5.6 본 앱 채택 엣지" }),
    }));
    const res = await submitSpecAnswers("s", [{ questionId: "edge-usage", answer: "활용" }]);
    expect(fetchMock.mock.calls[0]![0]).toContain("/spec-interview/answers");
    expect(res.embeddedSpec).toContain("5.6 본 앱 채택 엣지");
  });
});

describe("graceful degradation", () => {
  it("throws a friendly error when the API base URL is unset", async () => {
    delete g.__API_BASE_URL__;
    await expect(submitEdgeSelection("s", "accept", "e")).rejects.toBeInstanceOf(EdgeFlowError);
  });

  it("throws a friendly error on a non-OK response", async () => {
    mockFetch(() => ({ ok: false, status: 404 }));
    await expect(submitSpecAnswers("s", [])).rejects.toThrow(/오류 404/);
  });
});
