import { describe, it, expect } from "vitest";
import {
  badgeLabel,
  confidenceTone,
  riskTone,
  fmtPct,
  fmtSignedPct,
  returnTone,
} from "../formatters";

describe("badgeLabel", () => {
  it("maps levels to Korean labels", () => {
    expect(badgeLabel("high")).toBe("높음");
    expect(badgeLabel("medium")).toBe("보통");
    expect(badgeLabel("low")).toBe("낮음");
  });
});

describe("confidenceTone / riskTone", () => {
  it("confidence: high→positive, medium→neutral, low→muted", () => {
    expect(confidenceTone("high")).toBe("positive");
    expect(confidenceTone("medium")).toBe("neutral");
    expect(confidenceTone("low")).toBe("muted");
  });
  it("risk: low→positive, medium→warning, high→negative", () => {
    expect(riskTone("low")).toBe("positive");
    expect(riskTone("medium")).toBe("warning");
    expect(riskTone("high")).toBe("negative");
  });
});

describe("percent formatting", () => {
  it("fmtSignedPct adds a sign, rounds to 2 decimals, handles null", () => {
    expect(fmtSignedPct(12.3)).toBe("+12.30%");
    expect(fmtSignedPct(-4.5)).toBe("-4.50%");
    expect(fmtSignedPct(0)).toBe("+0.00%");
    expect(fmtSignedPct(327.773)).toBe("+327.77%");
    expect(fmtSignedPct(null)).toBe("—");
    expect(fmtSignedPct(undefined)).toBe("—");
  });
  it("fmtPct omits the sign and handles null", () => {
    expect(fmtPct(38.89)).toBe("38.89%");
    expect(fmtPct(null)).toBe("—");
  });
  it("returnTone reflects sign", () => {
    expect(returnTone(5)).toBe("positive");
    expect(returnTone(-5)).toBe("negative");
    expect(returnTone(0)).toBe("muted");
    expect(returnTone(null)).toBe("muted");
  });
});
