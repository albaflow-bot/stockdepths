import { describe, it, expect, vi, afterEach } from "vitest";
import { searchSecurities, SecuritySearchUnavailableError } from "../securitySearchClient";

const g = globalThis as { __API_BASE_URL__?: string; fetch?: typeof fetch };

function withBase<T>(fn: () => T): T {
  g.__API_BASE_URL__ = "http://localhost:8787";
  return fn();
}

afterEach(() => {
  delete g.__API_BASE_URL__;
  vi.restoreAllMocks();
});

const SAMPLE = [
  {
    market: "KOSPI",
    code: "005930",
    name_ko: "삼성전자",
    name_en: "Samsung Electronics",
    last: 78400,
    change_pct: 1.6,
    direction: "up",
    weekly: [76000, 77000, 78000, 78100, 78200, 78300, 78400],
    signal: { label: "매수 적정", reason: "5일선 회복" },
  },
];

describe("searchSecurities", () => {
  it("빈 질의는 호출 없이 빈 배열", async () => {
    const spy = vi.fn();
    g.fetch = spy as unknown as typeof fetch;
    expect(await searchSecurities({ q: "   " })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("base 미설정 → SecuritySearchUnavailableError", async () => {
    await expect(searchSecurities({ q: "삼성" })).rejects.toBeInstanceOf(SecuritySearchUnavailableError);
  });

  it("정상 응답을 파싱 + q/market/limit 을 쿼리에 인코딩", async () => {
    await withBase(async () => {
      const fetchMock = vi.fn(async (url: string) => {
        expect(url).toContain("/api/search?q=%EC%82%BC%EC%84%B1"); // '삼성' 인코딩
        expect(url).toContain("market=KR");
        expect(url).toContain("limit=10");
        return { ok: true, json: async () => SAMPLE } as Response;
      });
      g.fetch = fetchMock as unknown as typeof fetch;
      const out = await searchSecurities({ q: "삼성", market: "KR", limit: 10 });
      expect(out).toHaveLength(1);
      expect(out[0]!.code).toBe("005930");
      expect(out[0]!.direction).toBe("up");
      expect(out[0]!.weekly).toHaveLength(7);
      expect(out[0]!.signal).toEqual({ label: "매수 적정", reason: "5일선 회복" });
    });
  });

  it("non-OK 응답 → 에러", async () => {
    await withBase(async () => {
      g.fetch = vi.fn(async () => ({ ok: false, status: 503 } as Response)) as unknown as typeof fetch;
      await expect(searchSecurities({ q: "삼성" })).rejects.toBeInstanceOf(SecuritySearchUnavailableError);
    });
  });

  it("배열 아닌 응답은 빈 배열로 graceful", async () => {
    await withBase(async () => {
      g.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ oops: true }) } as Response)) as unknown as typeof fetch;
      expect(await searchSecurities({ q: "삼성" })).toEqual([]);
    });
  });

  it("필드 누락 항목은 방어적으로 정규화 (direction 기본 flat, weekly 빈 배열)", async () => {
    await withBase(async () => {
      g.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => [{ market: "NASDAQ", code: "AAPL" }],
      } as Response)) as unknown as typeof fetch;
      const out = await searchSecurities({ q: "apple" });
      expect(out[0]).toMatchObject({ code: "AAPL", direction: "flat", weekly: [], signal: null });
    });
  });
});
