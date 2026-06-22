import { describe, it, expect } from "vitest";
import {
  LEGAL_DOCUMENTS,
  ADVICE_DISCLAIMER_DOC,
  TERMS_DOC,
  PRIVACY_DOC,
  type LegalDocument,
} from "../content";

const SENTENCE_TERMINATORS = [".", "?", "!", "…"];

function allStrings(doc: LegalDocument): string[] {
  const out = [doc.title, doc.shortLabel, doc.intro];
  for (const s of doc.sections) {
    out.push(s.heading, ...s.paragraphs);
  }
  return out;
}

function sentences(doc: LegalDocument): string[] {
  return [doc.intro, ...doc.sections.flatMap((s) => s.paragraphs)];
}

function docText(doc: LegalDocument): string {
  return allStrings(doc).join("\n");
}

describe("legal content — copy rules (SPEC Task 11)", () => {
  it("never ends a user-facing string with a trailing colon", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const s of allStrings(doc)) {
        expect(s.trim().endsWith(":"), `"${s}" must not end with a colon`).toBe(false);
        expect(s.trim().endsWith("："), `"${s}" must not end with a fullwidth colon`).toBe(false);
      }
    }
  });

  it("ends every sentence (intro + paragraphs) with a proper terminator", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const s of sentences(doc)) {
        const last = s.trim().slice(-1);
        expect(SENTENCE_TERMINATORS.includes(last), `"${s}" must end with a sentence terminator`).toBe(true);
      }
    }
  });

  it("has no empty paragraphs", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const s of sentences(doc)) expect(s.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("legal content — required coverage", () => {
  it("ships exactly the three documents in display order", () => {
    expect(LEGAL_DOCUMENTS.map((d) => d.id)).toEqual(["disclaimer", "terms", "privacy"]);
  });

  it("the disclaimer states it is 참고 조언, not investment advice, with no guarantee", () => {
    const t = docText(ADVICE_DISCLAIMER_DOC);
    expect(t).toContain("참고");
    expect(t).toContain("투자 자문이 아닙니다");
    expect(t).toContain("보장하지 않습니다");
    expect(t).toContain("책임은 사용자 본인");
  });

  it("the terms cover the no-account model and on-device-only storage", () => {
    const t = docText(TERMS_DOC);
    expect(t).toContain("로그인 없이");
    expect(t).toContain("기기에만 저장");
    expect(t).toContain("외부 서버에 보관하지 않습니다");
  });

  it("the privacy policy covers no account, on-device storage, and no third-party sharing", () => {
    const t = docText(PRIVACY_DOC);
    expect(t).toContain("회원 가입이 없으므로");
    expect(t).toContain("기기 내부 저장소에만 보관");
    expect(t).toContain("제3자에게 판매하거나 제공하지 않습니다");
  });
});
