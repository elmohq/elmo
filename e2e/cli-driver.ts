/**
 * CLI Driver for E2E Tests
 *
 * Drives `elmo init --dev` through a real pseudo-terminal (node-pty) so we
 * exercise the same interactive wizard a human would see. Matches prompt
 * substrings and sends keystrokes — no skeleton `.env`, no CI shortcut path.
 *
 * Usage: tsx cli-driver.ts <config-dir> <repo-root>
 */
import * as pty from "node-pty";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

// node-pty ships `spawn-helper` as a prebuilt binary, but pnpm's tarball
// unpack drops the executable bit on some setups. Without +x, posix_spawnp
// fails at term creation. Fix it before we touch pty.spawn.
(function ensureSpawnHelperExecutable() {
	if (process.platform === "win32") return;
	try {
		const require_ = createRequire(import.meta.url);
		const ptyDir = path.dirname(require_.resolve("node-pty"));
		const helper = path.join(
			ptyDir,
			"..",
			"prebuilds",
			`${process.platform}-${process.arch}`,
			"spawn-helper",
		);
		if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
	} catch {
		// If we can't chmod, let the spawn fail with its own error.
	}
})();

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

const ENTER = "\r";
const ARROW_LEFT = "\x1b[D";

// Strip ANSI CSI + OSC sequences so we can substring-match clack's rendered output.
function stripAnsi(s: string): string {
	return s
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "");
}

const term = pty.spawn("node", [cliPath, "init", "--dev", "--dir", configDir], {
	name: "xterm-256color",
	cols: 120,
	rows: 40,
	cwd: repoRoot,
	env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
});

let buffer = "";

term.onData((data) => {
	process.stderr.write(data);
	buffer += stripAnsi(data);
	if (buffer.length > 32_000) buffer = buffer.slice(-16_000);
});

let exited: { exitCode: number; signal?: number } | null = null;
term.onExit((evt) => {
	exited = evt;
});

async function waitFor(pattern: string, timeoutMs = 60_000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (exited) {
			throw new Error(
				`CLI exited (code=${exited.exitCode}) before prompt: "${pattern}"`,
			);
		}
		const idx = buffer.indexOf(pattern);
		if (idx !== -1) {
			// Drop everything up to and including the match so we don't re-match it.
			buffer = buffer.slice(idx + pattern.length);
			return;
		}
		await new Promise((r) => setTimeout(r, 40));
	}
	throw new Error(
		`Timed out after ${timeoutMs}ms waiting for prompt: "${pattern}"\n` +
			`-- recent output --\n${buffer.slice(-2000)}`,
	);
}

async function send(s: string, settleMs = 120): Promise<void> {
	term.write(s);
	// Let clack render the answer + move to the next prompt before we match again.
	await new Promise((r) => setTimeout(r, settleMs));
}

async function waitForExit(timeoutMs = 30_000): Promise<number> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (exited) return exited.exitCode;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error("CLI did not exit within timeout");
}

async function main(): Promise<void> {
	// Dev mode → docker dir prompt (default "docker")
	await waitFor("Path to docker directory");
	await send(ENTER);

	// Postgres mode select — default "Run Postgres in Docker"
	await waitFor("PostgreSQL connection");
	await send(ENTER);

	// BrightData confirm (default Yes) → No
	await waitFor("Configure BrightData?");
	await send(ARROW_LEFT);
	await send(ENTER);

	// Olostep confirm (default No) → No
	await waitFor("Configure Olostep?");
	await send(ENTER);

	// Anthropic confirm (default No) → Yes
	await waitFor("Configure Anthropic API?");
	await send(ARROW_LEFT);
	await send(ENTER);
	await waitFor("Anthropic API key");
	await send(`sk-ant-placeholder-not-used${ENTER}`);
	await waitFor("Claude model");
	await send(ENTER); // accept default slug
	await waitFor("Enable Claude's web search tool?");
	await send(ARROW_LEFT);
	await send(ENTER); // No — target becomes claude:anthropic-api:<slug> without :online

	// OpenAI confirm (default No) → Yes
	await waitFor("Configure OpenAI API?");
	await send(ARROW_LEFT);
	await send(ENTER);
	await waitFor("OpenAI API key");
	await send(`sk-placeholder-not-used${ENTER}`);
	await waitFor("OpenAI model");
	await send(ENTER); // accept default gpt-5-mini
	await waitFor("Enable the web_search_preview tool?");
	await send(ENTER); // Yes — chatgpt:openai-api:gpt-5-mini:online

	// OpenRouter confirm (default No) → No
	await waitFor("Configure OpenRouter?");
	await send(ENTER);

	// DataForSEO confirm (default No) → Yes (placeholder creds, no extra target)
	await waitFor("Configure DataForSEO?");
	await send(ARROW_LEFT);
	await send(ENTER);
	await waitFor("DataForSEO login");
	await send(`placeholder@e2e.test${ENTER}`);
	await waitFor("DataForSEO password");
	await send(`placeholder-not-used${ENTER}`);
	await waitFor("Also scrape Google AI Mode");
	await send(ENTER); // No

	// SCRAPE_TARGETS edit confirm (default No)
	await waitFor("Edit SCRAPE_TARGETS before saving?");
	await send(ENTER);

	// Product updates email (optional)
	await waitFor("email to receive product updates");
	await send(ENTER);

	// Start the stack now? (default Yes) → No
	await waitFor("Start the stack now?");
	await send(ARROW_LEFT);
	await send(ENTER);

	const code = await waitForExit();
	if (code !== 0) {
		throw new Error(`CLI exited with code ${code}`);
	}
	console.error("\n  [driver] CLI completed successfully");
}

const overallTimeout = setTimeout(() => {
	console.error("\n  [driver] TIMEOUT: wizard did not complete within 120s");
	try {
		term.kill();
	} catch {}
	process.exit(1);
}, 120_000);
overallTimeout.unref();

main().catch((err) => {
	console.error(`\n  [driver] ERROR: ${err instanceof Error ? err.message : err}`);
	try {
		term.kill();
	} catch {}
	process.exit(1);
});
