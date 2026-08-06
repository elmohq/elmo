/**
 * One Playwright project per deployment mode.
 *
 * The stack serves a single DEPLOYMENT_MODE at a time, so a run targets one
 * mode: `--project=cloud` expects the web container to already be running in
 * cloud mode (see e2e/modes/*.yaml and .github/workflows/e2e.yaml). Each mode
 * runs the shared specs — the behaviour every deployment owes its users — plus
 * the specs for what makes that mode different.
 */
import { defineConfig, devices } from "@playwright/test";
import { authStatePath, DEPLOYMENT_MODES } from "./fixtures";

// Base URL can be overridden via environment variable.
// Default: http://localhost:1515 (Docker Compose maps web:3000 → host:1515)
const BASE_URL = process.env.BASE_URL || "http://localhost:1515";

// Each mode run writes its own HTML report so the three CI passes don't
// overwrite each other's output.
const HTML_REPORT_DIR = process.env.PLAYWRIGHT_HTML_REPORT || "playwright-report";

const modeProjects = DEPLOYMENT_MODES.flatMap((mode) => [
  {
    name: `${mode}:setup`,
    testMatch: /auth\.setup\.ts/,
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: mode,
    dependencies: [`${mode}:setup`],
    testMatch: ["shared/**/*.spec.ts", `${mode}/**/*.spec.ts`],
    // Playwright wipes the output dir of every project it runs, so each mode
    // keeps its own — a shared one would delete the previous pass's traces
    // before CI uploads them.
    outputDir: `test-results-${mode}`,
    use: { ...devices["Desktop Chrome"], storageState: authStatePath(mode) },
  },
]);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
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
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    ...modeProjects,
    // Run explicitly by the CI worker phase (--project=worker) once the worker
    // container is up; the mode projects stay worker-free so a bare local run
    // doesn't hang on (or feed a paid job to) whatever worker happens to be
    // running. The timeout leaves room for the spec's 120s poll (worker
    // startup + one pg-boss retry). It needs no session — the spec drives the
    // public API with a bearer key.
    {
      name: "worker",
      testMatch: /worker\.spec\.ts/,
      outputDir: "test-results-worker",
      timeout: 150_000,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
