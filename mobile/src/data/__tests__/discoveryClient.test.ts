import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchDiscovery, DiscoveryUnavailableError } from "../discoveryClient";

const g = globalThis as { __API_BASE_URL__?: string; fetch?: typeof fetch };

afterEach(() => {
  delete g.__API_BASE_URL__;
  vi.restoreAllMocks();
});

const ARTIFACT = {
  market: "US",
  asof: "2026-06-24",
  generatedAt: "2026-06-24T21:00:00Z",
  provider: "deterministic",
  categories: { gainers: [] },
  stats: { scanned: 10, afterNoiseFilter: 8, largeCapsExcluded: 2, candidates: 5 },
};

describe("fetchDiscovery", () => {
  it("base 미설정 → DiscoveryUnavailableError", async () => {
    await expect(fetchDiscovery("US")).rejects.toBeInstanceOf(DiscoveryUnavailableError);
  });

  it("정상 응답을 파싱 + market 쿼리 인코딩", async () => {
    g.__API_BASE_URL__ = "http://localhost:8787";
    g.fetch = vi.fn(async (url: string) => {
      expect(url).toContain("/api/discover?market=KR");
      return { ok: true, status: 200, json: async () => ({ ...ARTIFACT, market: "KR" }) } as Response;
    }) as unknown as typeof fetch;
    const out = await fetchDiscovery("KR");
    expect(out.market).toBe("KR");
    expect(out.stats.scanned).toBe(10);
  });

  it("404(미생성)는 친절한 메시지로 표면화", async () => {
    g.__API_BASE_URL__ = "http://localhost:8787";
    g.fetch = vi.fn(async () => ({ ok: false, status: 404 } as Response)) as unknown as typeof fetch;
    await expect(fetchDiscovery("US")).rejects.toBeInstanceOf(DiscoveryUnavailableError);
    await expect(fetchDiscovery("US")).rejects.toThrow(/아직 준비되지/);
  });

  it("기타 오류도 에러", async () => {
    g.__API_BASE_URL__ = "http://localhost:8787";
    g.fetch = vi.fn(async () => ({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;
    await expect(fetchDiscovery("US")).rejects.toBeInstanceOf(DiscoveryUnavailableError);
  });
});
