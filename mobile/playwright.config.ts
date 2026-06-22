import { defineConfig, devices } from "@playwright/test";

const PORT = 8081;
const isCI = Boolean(process.env["CI"]);

/**
 * E2E config. The web server runs Expo Web; the spec mocks the picks API via
 * route interception so the critical flow is deterministic (E2E 하네스 계약).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: isCI ? 1 : 0,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run web",
    port: PORT,
    timeout: 180_000,
    reuseExistingServer: !isCI,
    env: {
      // Any non-empty base so the client builds a URL the test can intercept.
      EXPO_PUBLIC_API_BASE_URL: `http://localhost:${PORT}`,
      BROWSER: "none",
    },
  },
});
