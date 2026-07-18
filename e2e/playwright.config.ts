import { defineConfig, devices } from "@playwright/test";

// Base URL can be overridden via environment variable.
// Default: http://localhost:1515 (Docker Compose maps web:3000 → host:1515)
const BASE_URL = process.env.BASE_URL || "http://localhost:1515";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 4,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "on-failure" }]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  maxFailures: process.env.CI ? 10 : 5,

  globalSetup: "./auth-setup.ts",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    storageState: "e2e/.auth/user.json",
  },

  projects: [
    {
      name: "fixtures",
      testIgnore: /worker\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Run explicitly by CI phase 2 (--project=worker) once the worker
    // container is up; `pnpm test:e2e` stays worker-free so a bare local run
    // doesn't hang on (or feed a paid job to) whatever worker happens to be
    // running. Separate outputDir because Playwright wipes the output dir of
    // every project it runs — sharing test-results/ would delete phase 1's
    // traces and the Bruno reports before CI uploads them. The timeout leaves
    // room for the spec's 120s poll (worker startup + one pg-boss retry).
    {
      name: "worker",
      testMatch: /worker\.spec\.ts/,
      outputDir: "test-results-worker",
      timeout: 150_000,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
