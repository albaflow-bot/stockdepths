import { describe, it, expect } from "vitest";
import { buildPresetConfig, buildCustomConfig } from "../config";
import { PersonaValidationError } from "../types";
import {
  effectiveProfile,
  acceptableRisks,
  pickMatchesPersona,
  personaLabel,
} from "../matching";

describe("buildPresetConfig", () => {
  it("resolves preset thresholds", () => {
    expect(buildPresetConfig("conservative", "t")).toMatchObject({
      mode: "preset",
      profile: "conservative",
      targetReturnPct: 10,
      stopLossPct: 5,
    });
    expect(buildPresetConfig("aggressive", "t")).toMatchObject({ targetReturnPct: 40, stopLossPct: 20 });
  });
});

describe("buildCustomConfig", () => {
  it("accepts positive target/stop", () => {
    expect(buildCustomConfig(25, 12, "t")).toMatchObject({ mode: "custom", targetReturnPct: 25, stopLossPct: 12 });
  });
  it("rejects non-positive values", () => {
    expect(() => buildCustomConfig(0, 10, "t")).toThrow(PersonaValidationError);
    expect(() => buildCustomConfig(10, -1, "t")).toThrow(PersonaValidationError);
    expect(() => buildCustomConfig(Number.NaN, 10, "t")).toThrow(PersonaValidationError);
  });
});

describe("matching", () => {
  it("maps presets to acceptable risk levels", () => {
    expect(acceptableRisks(buildPresetConfig("conservative", "t"))).toEqual(["low"]);
    expect(acceptableRisks(buildPresetConfig("neutral", "t"))).toEqual(["low", "medium"]);
    expect(acceptableRisks(buildPresetConfig("aggressive", "t"))).toEqual(["low", "medium", "high"]);
  });

  it("derives an effective profile for custom personas from the stop-loss", () => {
    expect(effectiveProfile(buildCustomConfig(8, 4, "t"))).toBe("conservative");
    expect(effectiveProfile(buildCustomConfig(20, 10, "t"))).toBe("neutral");
    expect(effectiveProfile(buildCustomConfig(60, 25, "t"))).toBe("aggressive");
  });

  it("matches pick volatility to the persona", () => {
    const conservative = buildPresetConfig("conservative", "t");
    expect(pickMatchesPersona("low", conservative)).toBe(true);
    expect(pickMatchesPersona("high", conservative)).toBe(false);

    const aggressive = buildPresetConfig("aggressive", "t");
    expect(pickMatchesPersona("high", aggressive)).toBe(true);
  });

  it("labels personas", () => {
    expect(personaLabel(buildPresetConfig("neutral", "t"))).toBe("중립형");
    expect(personaLabel(buildCustomConfig(30, 12, "t"))).toBe("직접 설정");
  });
});
