# Landing page — AI 주식 타이밍 알리미

Marketing landing page (SPEC Task 12 — Launch Pack). **Static, zero-dependency** —
deployable to any static host (or GitHub Pages / Netlify / S3) with no build step.

## What's here

| File | Purpose |
|---|---|
| `index.html` | The page — hero, trust strip, 5-feature section, honesty section, install CTA, footer, and full OG/Twitter meta. |
| `styles.css` | Design system mirroring the app tokens (`mobile/src/theme/tokens.ts`): deep-navy primary, calm neutrals, semantic green. No purple-gradient AI-slop look. |
| `og-image.svg` | 1200×630 social share image (the honest-scorecard trust angle). |
| `favicon.svg` | App mark. |
| `serve.mjs` | Tiny zero-dep static preview server. |
| `test/landing.test.mjs` | `node:test` grader (no install needed). |

## Content angle (SPEC §핵심 차별점)

- **Hero**: "추천만 보여주지 않습니다. 5년 백테스트와 정직한 성적표를 함께 보여줍니다." —
  the honest scorecard + auto-backtest trust angle.
- **Features**: the 5 core screens — 오늘의 추천 / 관심·보유 / 내 성향 / 성적표 / 알림함.
- **Honesty section**: benchmark-relative cumulative excess return as the headline,
  plus win rate, per-trade average, and MDD, with an example scorecard card.
- **CTA**: free Android install, no login.
- **Footer**: the '참고 조언' disclaimer, links to the three legal pages
  (참고 조언 안내 / 이용약관 / 개인정보처리방침), and the on-device / no-account note.

## Commands

```bash
npm test     # node:test grader — validates OG/Twitter meta + required content
npm run serve  # preview at http://localhost:4173
```

## Tests (deterministic grader)

`test/landing.test.mjs` asserts: Korean `lang` + viewport + charset; all required
**Open Graph** tags (`og:type/title/description/image/url/locale` + image
dimensions) and the OG image asset; **Twitter** card tags; the hero trust angle
(백테스트 + 정직한 성적표 in the `<h1>`); the **5 core screens**; the install CTA;
the advice disclaimer + on-device/no-login messaging; the three legal links; and
the copy rule (no visible line ends with a trailing colon — consistent with Task 11).

## Notes

- The OG image is an SVG. Most platforms render it; if a target crawler needs a
  raster image, export `og-image.svg` to PNG at 1200×630 and update the `og:image`
  URLs in `index.html`.
- Legal links point to `./legal/*.html`. Those pages share the content authored in
  `mobile/src/legal/content.ts` (Task 11) — export them to static HTML at deploy
  time, or host the app's legal screens at those paths.
