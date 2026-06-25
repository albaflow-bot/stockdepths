import { describe, it, expect } from "vitest";
import { PortfolioRepository } from "../repository";
import { PortfolioValidationError } from "../types";
import { createMemoryStorage } from "../../data/storage";

/** SPEC §3.2-Δ: 코드 없이 한글 검색으로 담는 KR 종목(숫자 단축코드)도 담겨야 한다. */
describe("PortfolioRepository — KR 단축코드 지원", () => {
  function repo() {
    return new PortfolioRepository({ storage: createMemoryStorage() });
  }

  it("관심: 한국 단축코드(005930)를 받아들인다", async () => {
    const pf = await repo().addToWatchlist("005930");
    expect(pf.watchlist.map((w) => w.symbol)).toEqual(["005930"]);
  });

  it("보유: 한국 단축코드 보유 추가", async () => {
    const pf = await repo().addHolding({ symbol: "005930", costBasis: 78400, quantity: 3 });
    expect(pf.holdings[0]!.symbol).toBe("005930");
  });

  it("미국 티커도 그대로 동작 (AAPL)", async () => {
    const pf = await repo().addToWatchlist("aapl");
    expect(pf.watchlist[0]!.symbol).toBe("AAPL");
  });

  it("여전히 불량 입력은 거부 (특수문자)", async () => {
    await expect(repo().addToWatchlist("123$$")).rejects.toBeInstanceOf(PortfolioValidationError);
  });
});
