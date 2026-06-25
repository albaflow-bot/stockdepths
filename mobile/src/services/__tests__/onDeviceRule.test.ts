import { describe, it, expect, vi } from "vitest";
import {
  evaluateHoldingRule,
  resolveThresholds,
  resolveSignalConflict,
  firedKey,
  OnDeviceRuleService,
  type RuleQuote,
} from "../onDeviceRule";
import { NotificationRepository } from "../../notifications/repository";
import { createMemoryStorage } from "../../data/storage";
import type { Holding } from "../../portfolio/types";
import type { PersonaConfig } from "../../persona/types";
import type { TimingSignal } from "../../types/timing";

function holding(over: Partial<Holding> = {}): Holding {
  return { id: "h1", symbol: "AAPL", costBasis: 100, createdAt: "2026-06-01T00:00:00Z", ...over };
}

const neutral: PersonaConfig = {
  mode: "preset",
  profile: "neutral",
  targetReturnPct: 20,
  stopLossPct: 10,
  setAt: "2026-06-01T00:00:00Z",
};

function quote(price: number, asOf = "2026-06-24", changePercent?: number): RuleQuote {
  return { symbol: "AAPL", price, asOf, changePercent };
}

describe("resolveThresholds", () => {
  it("uses persona % defaults when the holding has no override", () => {
    expect(resolveThresholds(holding(), neutral)).toEqual({ targetPrice: 120, stopLossPrice: 90 });
  });
  it("prefers a per-holding absolute price override", () => {
    expect(resolveThresholds(holding({ targetPrice: 150, stopLossPrice: 80 }), neutral)).toEqual({
      targetPrice: 150,
      stopLossPrice: 80,
    });
  });
  it("falls back to neutral defaults when no persona is set", () => {
    expect(resolveThresholds(holding())).toEqual({ targetPrice: 120, stopLossPrice: 90 });
  });
});

describe("evaluateHoldingRule", () => {
  it("emits a Sell signal when the target is reached", () => {
    const e = evaluateHoldingRule(holding(), quote(125, "2026-06-24", 3), neutral)!;
    expect(e.condition).toBe("target_reached");
    expect(e.signal.action).toBe("sell");
    expect(e.signal.source).toBe("onDeviceRule");
    expect(e.signal.confidence).toBe(1);
    expect(e.signal.oneLineReason).toContain("목표가 도달");
    expect(e.signal.oneLineReason).toContain("오늘 +3%");
    expect(e.signal.evaluatedAt).toBe("2026-06-24");
  });

  it("emits a Sell signal when the stop-loss is reached", () => {
    const e = evaluateHoldingRule(holding(), quote(85), neutral)!;
    expect(e.condition).toBe("stop_loss");
    expect(e.signal.action).toBe("sell");
    expect(e.signal.oneLineReason).toContain("손절선 도달");
  });

  it("emits Hold/Watch for approaching thresholds (no reach)", () => {
    expect(evaluateHoldingRule(holding(), quote(119), neutral)!.condition).toBe("approaching_target");
    expect(evaluateHoldingRule(holding(), quote(119), neutral)!.signal.action).toBe("hold");
    expect(evaluateHoldingRule(holding(), quote(91), neutral)!.condition).toBe("approaching_stop");
    expect(evaluateHoldingRule(holding(), quote(91), neutral)!.signal.action).toBe("watch");
  });

  it("emits a Hold signal when nothing is actionable", () => {
    const e = evaluateHoldingRule(holding(), quote(105), neutral)!;
    expect(e.condition).toBe("none");
    expect(e.signal.action).toBe("hold");
    expect(e.signal.oneLineReason).toContain("보유 유지");
  });

  it("returns null for an unusable cost/price", () => {
    expect(evaluateHoldingRule(holding({ costBasis: 0 }), quote(100), neutral)).toBeNull();
    expect(evaluateHoldingRule(holding(), quote(0), neutral)).toBeNull();
  });

  it("never produces a signal without a one-line reason", () => {
    for (const p of [125, 85, 119, 91, 105]) {
      const e = evaluateHoldingRule(holding(), quote(p), neutral)!;
      expect(e.signal.oneLineReason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("resolveSignalConflict (SPEC §5.4: personal wins, both shown)", () => {
  const personal: TimingSignal = {
    ticker: "AAPL", action: "sell", confidence: 1, oneLineReason: "손절선 도달", contextNewsIds: [], evaluatedAt: "2026-06-24", source: "onDeviceRule",
  };
  const batch: TimingSignal = {
    ticker: "AAPL", action: "hold", confidence: 0.6, oneLineReason: "박스권", contextNewsIds: [], evaluatedAt: "2026-06-24", source: "dailyBatch",
  };
  it("ranks the personal rule on top, keeps the batch signal below", () => {
    const ordered = resolveSignalConflict(personal, batch);
    expect(ordered.map((s) => s.source)).toEqual(["onDeviceRule", "dailyBatch"]);
  });
  it("returns whichever exists when only one is present", () => {
    expect(resolveSignalConflict(undefined, batch).map((s) => s.source)).toEqual(["dailyBatch"]);
    expect(resolveSignalConflict(personal).map((s) => s.source)).toEqual(["onDeviceRule"]);
  });
});

describe("OnDeviceRuleService — push trigger + de-dup", () => {
  function makeService() {
    const storage = createMemoryStorage();
    const present = vi.fn(async () => true);
    const service = new OnDeviceRuleService({
      storage,
      notifications: new NotificationRepository({ storage }),
      present,
      now: () => "2026-06-24T09:00:00.000Z",
    });
    return { service, present, storage };
  }

  it("fires a push when a holding hits its target, with a one-line body", async () => {
    const { service, present } = makeService();
    const r = await service.evaluate([holding()], [quote(130)], neutral);
    expect(r.fired).toHaveLength(1);
    expect(r.fired[0]!.title).toBe("AAPL 매도 검토");
    expect(r.fired[0]!.category).toBe("target_reached");
    expect(present).toHaveBeenCalledOnce();
    expect(present).toHaveBeenCalledWith("AAPL 매도 검토", expect.stringContaining("목표가 도달"));
    // one signal per holding, source on-device
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]!.source).toBe("onDeviceRule");
  });

  it("does NOT re-fire the same reached condition on the same day (de-dup)", async () => {
    const { service, present } = makeService();
    await service.evaluate([holding()], [quote(130)], neutral);
    const second = await service.evaluate([holding()], [quote(131)], neutral); // still target_reached, same day
    expect(second.fired).toHaveLength(0);
    expect(present).toHaveBeenCalledOnce(); // not twice
  });

  it("re-arms on the next day (new asOf → new de-dup key)", async () => {
    const { service, present } = makeService();
    await service.evaluate([holding()], [quote(130, "2026-06-24")], neutral);
    const next = await service.evaluate([holding()], [quote(130, "2026-06-25")], neutral);
    expect(next.fired).toHaveLength(1);
    expect(present).toHaveBeenCalledTimes(2);
  });

  it("does not push for non-reached conditions (hold/watch)", async () => {
    const { service, present } = makeService();
    const r = await service.evaluate([holding()], [quote(105)], neutral); // none → hold
    expect(r.fired).toHaveLength(0);
    expect(present).not.toHaveBeenCalled();
    expect(r.signals[0]!.action).toBe("hold");
  });

  it("skips holdings without a matching quote", async () => {
    const { service } = makeService();
    const r = await service.evaluate([holding(), holding({ id: "h2", symbol: "MSFT" })], [quote(130)], neutral);
    expect(r.signals.map((s) => s.ticker)).toEqual(["AAPL"]); // MSFT skipped (no quote)
  });

  it("firedKey is stable per (symbol, condition, day)", () => {
    expect(firedKey("aapl", "stop_loss", "2026-06-24")).toBe("AAPL:stop_loss:2026-06-24");
  });
});
