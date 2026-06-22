import { describe, it, expect } from "vitest";
import { PersonaRepository } from "../repository";
import { buildPresetConfig } from "../config";
import { createMemoryStorage } from "../../data/storage";

describe("PersonaRepository", () => {
  it("returns null on first run (drives the gate)", async () => {
    const repo = new PersonaRepository({ storage: createMemoryStorage() });
    expect(await repo.load()).toBeNull();
  });

  it("saves and loads a persona, persisting across instances", async () => {
    const storage = createMemoryStorage();
    const r1 = new PersonaRepository({ storage, now: () => "2026-06-21T00:00:00Z" });
    await r1.save(buildPresetConfig("neutral", r1.now()));

    const r2 = new PersonaRepository({ storage });
    const loaded = await r2.load();
    expect(loaded).toMatchObject({ mode: "preset", profile: "neutral", targetReturnPct: 20 });
  });

  it("clears the persona", async () => {
    const repo = new PersonaRepository({ storage: createMemoryStorage() });
    await repo.save(buildPresetConfig("aggressive", "t"));
    await repo.clear();
    expect(await repo.load()).toBeNull();
  });

  it("treats a corrupt store as no-persona", async () => {
    const storage = createMemoryStorage();
    await storage.setItem("bindesk:persona", "not json");
    expect(await new PersonaRepository({ storage }).load()).toBeNull();
  });
});
