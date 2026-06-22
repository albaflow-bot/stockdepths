/**
 * Zero-dependency landing grader (node:test). Validates the OG/Twitter meta tags
 * and the required marketing content (hero trust angle, 5 core screens, install
 * CTA, disclaimer, on-device/no-login messaging, legal links, OG image asset).
 *
 * Run: npm test   (in landing/)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const html = readFileSync(join(root, "index.html"), "utf8");

function has(substr) {
  assert.ok(html.includes(substr), `index.html should contain: ${substr}`);
}

test("declares Korean lang + viewport + charset", () => {
  has('<html lang="ko"');
  has('name="viewport"');
  has('charset="utf-8"');
});

test("has the required Open Graph meta tags", () => {
  for (const p of ["og:type", "og:title", "og:description", "og:image", "og:url", "og:locale"]) {
    has(`property="${p}"`);
  }
  has('property="og:image:width"');
  has('property="og:image:height"');
  has("og-image.svg");
});

test("has Twitter card meta tags", () => {
  has('name="twitter:card"');
  has('content="summary_large_image"');
  has('name="twitter:title"');
  has('name="twitter:image"');
});

test("hero emphasizes the honest scorecard + auto-backtest trust angle", () => {
  has("5년 백테스트");
  has("정직한 성적표");
  assert.match(html, /<h1[\s\S]*백테스트[\s\S]*<\/h1>/, "hero h1 should mention 백테스트");
});

test("features section covers the 5 core screens", () => {
  for (const screen of ["오늘의 추천", "관심·보유", "내 성향", "성적표", "알림함"]) {
    has(`<h3>${screen}</h3>`);
  }
});

test("has an install CTA section", () => {
  has('id="install"');
  has("안드로이드에서 설치하기");
});

test("shows the advice disclaimer and on-device / no-login messaging", () => {
  has("AI는 보장이 아닌 참고 조언입니다.");
  has("기기에만 저장");
  assert.ok(/로그인 없이|계정 없이/.test(html), "should mention no-login / no-account");
});

test("links to the three legal pages", () => {
  has("참고 조언 안내");
  has("이용약관");
  has("개인정보처리방침");
});

test("includes privacy-friendly analytics (Plausible)", () => {
  has("plausible.io/js/script.js");
  has("data-domain=");
});

test("references stylesheet, favicon, and ships the OG image asset", () => {
  has('href="./styles.css"');
  has('href="./favicon.svg"');
  assert.ok(existsSync(join(root, "og-image.svg")), "og-image.svg must exist");
  assert.ok(existsSync(join(root, "styles.css")), "styles.css must exist");
  assert.ok(existsSync(join(root, "favicon.svg")), "favicon.svg must exist");
});

test("no user-facing line ends with a trailing colon (copy rule)", () => {
  // Check visible text inside tags for trailing colons (Task 11 copy rule).
  const visible = html.match(/>([^<>]+)</g) ?? [];
  for (const chunk of visible) {
    const text = chunk.slice(1, -1).trim();
    if (!text) continue;
    assert.ok(!text.endsWith(":"), `visible text must not end with a colon: "${text}"`);
    assert.ok(!text.endsWith("："), `visible text must not end with a fullwidth colon: "${text}"`);
  }
});
