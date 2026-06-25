/**
 * Vercel catch-all entry — handles `/api` and single-segment `/api/*` paths.
 * Nested 2-segment paths get their own thin entry files (Vercel's optional
 * catch-all does not reliably match them); all delegate to the shared handler.
 */
export { default } from "../src/api/serverless.js";
