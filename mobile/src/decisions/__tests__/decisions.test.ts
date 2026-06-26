import { describe, it, expect } from "vitest";
import { DecisionRepository } from "../repository";
import { SEED_DECISIONS } from "../queue";
import { createMemoryStorage } from "../../data/storage";

describe("SEED_DECISIONS (mirrors specs/decision-queue.md)", () => {
  it("exposes the three delta decisions with stable ids", () => {
    expect(SEED_DECISIONS.map((d) => d.id)).toEqual(["DQ-1", "DQ-2", "DQ-3"]);
  });
  it("defaults all delta decisions to approved (사용자 일괄 승인)", () => {
    for (const d of SEED_DECISIONS) expect(d.status).toBe("approved");
  });
  it("every item carries a plain-language summary + what's needed", () => {
    for (const d of SEED_DECISIONS) {
      expect(d.summary.trim().length).toBeGreaterThan(0);
      expect(d.needs.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("DecisionRepository", () => {
  function makeRepo() {
    return new DecisionRepository({ storage: createMemoryStorage() });
  }

  it("lists the seed items with their default status before any decision", async () => {
    const items = await makeRepo().list();
    expect(items.map((i) => i.id)).toEqual(["DQ-1", "DQ-2", "DQ-3"]);
    expect(items.find((i) => i.id === "DQ-1")!.status).toBe("approved");
  });

  it("persists a decision as a status overlay and reports the open count", async () => {
    const repo = makeRepo();
    expect(await repo.openCount()).toBe(0); // 시드 전부 approved → 미결정 0
    await repo.setStatus("DQ-1", "open"); // 다시 미결정으로 표시하면 overlay 반영
    expect((await repo.list()).find((i) => i.id === "DQ-1")!.status).toBe("open");
    expect(await repo.openCount()).toBe(1);
  });

  it("keeps decisions across fresh repository instances on the same storage", async () => {
    const storage = createMemoryStorage();
    await new DecisionRepository({ storage }).setStatus("DQ-3", "rejected");
    const reloaded = await new DecisionRepository({ storage }).list();
    expect(reloaded.find((i) => i.id === "DQ-3")!.status).toBe("rejected");
  });

  it("supports re-deciding an item (three separated actions)", async () => {
    const repo = makeRepo();
    await repo.setStatus("DQ-2", "approved");
    const after = await repo.setStatus("DQ-2", "deferred");
    expect(after.find((i) => i.id === "DQ-2")!.status).toBe("deferred");
  });
});
