/**
 * CLI Driver for E2E Tests
 *
 * Runs `elmo init --dev` in CI mode (ELMO_CI=1) with config provided
 * via environment variables — no interactive prompts needed.
 *
 * Usage: tsx cli-driver.ts <config-dir> <repo-root>
 */
import { spawn } from "child_process";
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
    ELMO_OPENAI_API_KEY: "sk-placeholder-not-used",
    ELMO_ANTHROPIC_API_KEY: "sk-ant-placeholder-not-used",
    ELMO_DATAFORSEO_LOGIN: "placeholder@e2e.test",
    ELMO_DATAFORSEO_PASSWORD: "placeholder-not-used",
    ELMO_SCRAPE_TARGETS: "chatgpt:direct:gpt-5-mini:online,claude:direct:claude-sonnet-4,google-ai-mode:dataforseo:online",
  },
  stdio: "inherit",
});

child.on("close", (code) => {
  console.error(`\n  [driver] CLI exited (code=${code})`);
  process.exit(code ?? 0);
});

// Safety timeout — kill if the CLI hangs
const timeout = setTimeout(() => {
  console.error("\n  [driver] TIMEOUT: CLI did not complete within 60s");
  child.kill();
  process.exit(1);
}, 60_000);
timeout.unref();
