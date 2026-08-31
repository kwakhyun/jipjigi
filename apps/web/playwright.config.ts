import { defineConfig } from "@playwright/test";

// Deliberately not configurable to a production URL: these tests change only
// disposable, locally seeded demo data, never the deployed database.
// Playwright's APIRequestContext sends Secure cookies over localhost, but not
// over a numeric HTTP loopback address. Match browser and API cookie behavior.
const baseURL = "http://localhost:3118";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/start-e2e-server.mjs",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 90_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
