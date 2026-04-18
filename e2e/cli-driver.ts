/**
 * CLI Driver for E2E Tests
 *
 * Runs `elmo init --dev` in CI mode (ELMO_CI=1) to generate a skeleton
 * `.env` + `elmo.yaml`, then appends the provider-key placeholders + SCRAPE_TARGETS
 * the test environment needs to boot the services.
 *
 * The CLI itself no longer reads provider keys from env vars; keys are either
 * entered interactively or appended to `.env` by callers like this one.
 *
 * Usage: tsx cli-driver.ts <config-dir> <repo-root>
 */
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

const configDir = process.argv[2];
const repoRoot = process.argv[3];

if (!configDir || !repoRoot) {
  console.error("Usage: tsx cli-driver.ts <config-dir> <repo-root>");
  process.exit(1);
}

const cliPath = path.join(repoRoot, "apps/cli/dist/index.js");

console.error(`  [driver] config-dir: ${configDir}`);
console.error(`  [driver] repo-root:  ${repoRoot}`);
console.error(`  [driver] cli-path:   ${cliPath}`);

const child = spawn("node", [cliPath, "init", "--dev", "--dir", configDir], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ELMO_CI: "1",
  },
  stdio: "inherit",
});

const E2E_ENV_APPEND = `
# Test-only provider placeholders (CLI leaves these unset in CI mode).
# Tests seed the database directly and do not hit real provider APIs.
OPENAI_API_KEY=sk-placeholder-not-used
ANTHROPIC_API_KEY=sk-ant-placeholder-not-used
DATAFORSEO_LOGIN=placeholder@e2e.test
DATAFORSEO_PASSWORD=placeholder-not-used
SCRAPE_TARGETS=chatgpt:openai-api:gpt-5-mini:online,claude:anthropic-api:claude-sonnet-4-20250514
`;

child.on("close", async (code) => {
  console.error(`\n  [driver] CLI exited (code=${code})`);
  if (code !== 0) {
    process.exit(code ?? 1);
  }
  try {
    const envPath = path.join(configDir, ".env");
    await fs.appendFile(envPath, E2E_ENV_APPEND);
    console.error(`  [driver] Appended E2E placeholders to ${envPath}`);
    process.exit(0);
  } catch (err) {
    console.error(`  [driver] Failed to append E2E env: ${err}`);
    process.exit(1);
  }
});

// Safety timeout — kill if the CLI hangs
const timeout = setTimeout(() => {
  console.error("\n  [driver] TIMEOUT: CLI did not complete within 60s");
  child.kill();
  process.exit(1);
}, 60_000);
timeout.unref();
