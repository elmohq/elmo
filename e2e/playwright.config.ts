/** One project per deployment mode, each addressing that mode's container (see e2e/modes.yaml). */
import { defineConfig, devices } from "@playwright/test";
import { authStatePath, DEPLOYMENT_MODES, modeUrl, WHITELABEL } from "./fixtures";
import type { ConsoleErrorOptions } from "./test";

// Set per CI pass, so the passes don't overwrite each other's report.
const HTML_REPORT_DIR = process.env.PLAYWRIGHT_HTML_REPORT || "playwright-report";

const modeProjects = DEPLOYMENT_MODES.flatMap((mode) => [
  {
    name: `${mode}:setup`,
    testMatch: /auth\.setup\.ts/,
    use: { ...devices["Desktop Chrome"], baseURL: modeUrl(mode) },
  },
  {
    name: mode,
    dependencies: [`${mode}:setup`],
    testMatch: ["shared/**/*.spec.ts", `${mode}/**/*.spec.ts`],
    // Playwright wipes a project's output dir, so a shared one would delete the previous pass's traces.
    outputDir: `test-results-${mode}`,
    use: {
      ...devices["Desktop Chrome"],
      baseURL: modeUrl(mode),
      storageState: authStatePath(mode),
      allowedConsoleErrors: mode === "whitelabel" ? [WHITELABEL.appIcon] : [],
    },
  },
]);

export default defineConfig<ConsoleErrorOptions>({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A silent retry hides a flaky test, so needing one fails the job; it still runs to produce a trace.
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 4,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: HTML_REPORT_DIR }], ["github"]]
    : [["list"], ["html", { open: "on-failure", outputFolder: HTML_REPORT_DIR }]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  maxFailures: process.env.CI ? 10 : 5,

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    ...modeProjects,
    // Only run explicitly once the worker is up, so a bare local run never feeds
    // a paid job to whatever worker is running. Room for the spec's 120s poll.
    {
      name: "worker",
      testMatch: /worker\.spec\.ts/,
      outputDir: "test-results-worker",
      timeout: 150_000,
      use: { ...devices["Desktop Chrome"], baseURL: modeUrl("local") },
    },
  ],
});
