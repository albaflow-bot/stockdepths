import { describe, it, expect } from "vitest";
import { PortfolioRepository } from "../repository";
import { PortfolioValidationError } from "../types";
import { createMemoryStorage } from "../../data/storage";

function makeRepo() {
  let n = 0;
  return new PortfolioRepository({
    storage: createMemoryStorage(),
    now: () => "2026-06-21T00:00:00.000Z",
    genId: () => `h${n++}`,
  });
}

describe("PortfolioRepository — watchlist", () => {
  it("adds, normalizes, dedupes, and removes", async () => {
    const repo = makeRepo();
    await repo.addToWatchlist("aapl");
    let pf = await repo.addToWatchlist("AAPL"); // dup (normalized)
    expect(pf.watchlist.map((w) => w.symbol)).toEqual(["AAPL"]);

    pf = await repo.addToWatchlist("msft");
    expect(pf.watchlist.map((w) => w.symbol)).toEqual(["MSFT", "AAPL"]); // newest first

    pf = await repo.removeFromWatchlist("aapl");
    expect(pf.watchlist.map((w) => w.symbol)).toEqual(["MSFT"]);
  });

  it("rejects an invalid symbol", async () => {
    const repo = makeRepo();
    await expect(repo.addToWatchlist("123$$")).rejects.toBeInstanceOf(PortfolioValidationError);
  });
});

describe("PortfolioRepository — holdings", () => {
  it("adds a holding with validated, normalized fields", async () => {
    const repo = makeRepo();
    const pf = await repo.addHolding({ symbol: "aapl", costBasis: 150.5, quantity: 10 });
    expect(pf.holdings).toHaveLength(1);
    expect(pf.holdings[0]).toMatchObject({ id: "h0", symbol: "AAPL", costBasis: 150.5, quantity: 10 });
  });

  it("allows a holding without quantity", async () => {
    const repo = makeRepo();
    const pf = await repo.addHolding({ symbol: "MSFT", costBasis: 400 });
    expect(pf.holdings[0]!.quantity).toBeUndefined();
  });

  it("rejects non-positive cost basis or quantity", async () => {
    const repo = makeRepo();
    await expect(repo.addHolding({ symbol: "AAPL", costBasis: 0 })).rejects.toBeInstanceOf(PortfolioValidationError);
    await expect(repo.addHolding({ symbol: "AAPL", costBasis: 10, quantity: -1 })).rejects.toBeInstanceOf(
      PortfolioValidationError,
    );
  });

  it("updates and removes a holding by id", async () => {
    const repo = makeRepo();
    await repo.addHolding({ symbol: "AAPL", costBasis: 100, quantity: 5 });
    let pf = await repo.updateHolding("h0", { costBasis: 110, quantity: 8 });
    expect(pf.holdings[0]).toMatchObject({ costBasis: 110, quantity: 8 });

    pf = await repo.removeHolding("h0");
    expect(pf.holdings).toHaveLength(0);
  });

  it("persists across repository instances sharing storage", async () => {
    const storage = createMemoryStorage();
    const r1 = new PortfolioRepository({ storage, genId: () => "h0", now: () => "t" });
    await r1.addHolding({ symbol: "AAPL", costBasis: 100, quantity: 1 });
    await r1.addToWatchlist("MSFT");

    const r2 = new PortfolioRepository({ storage });
    const pf = await r2.load();
    expect(pf.holdings).toHaveLength(1);
    expect(pf.watchlist.map((w) => w.symbol)).toEqual(["MSFT"]);
  });

  it("returns an empty portfolio when storage is empty or corrupt", async () => {
    const storage = createMemoryStorage();
    await storage.setItem("bindesk:portfolio", "not json");
    const repo = new PortfolioRepository({ storage });
    const pf = await repo.load();
    expect(pf).toEqual({ watchlist: [], holdings: [] });
  });
});
