/**
 * Answers the `elmo init --dev` wizard through a real PTY. script(1) provides
 * the PTY because it ships with Ubuntu and macOS, so no native addon is needed.
 *
 * The CLI writes to `~/.elmo`, so HOME is pointed at the parent of
 * <config-dir>, which must therefore end in `.elmo`.
 *
 * Usage: tsx cli-driver.ts <config-dir> <repo-root>
 */
import { spawn } from "node:child_process";
import path from "node:path";

const configDir = process.argv[2];
const repoRoot = process.argv[3];

if (!configDir || !repoRoot) {
	console.error("Usage: tsx cli-driver.ts <config-dir> <repo-root>");
	process.exit(1);
}

if (path.basename(configDir) !== ".elmo") {
	console.error(`config-dir must end in ".elmo" (got ${configDir})`);
	process.exit(1);
}

const cliHome = path.dirname(configDir);
const cliPath = path.join(repoRoot, "apps/cli/dist/index.js");
const nodeBin = process.execPath;

console.error(`  [driver] config-dir: ${configDir}`);
console.error(`  [driver] cli-home:   ${cliHome}`);
console.error(`  [driver] repo-root:  ${repoRoot}`);
console.error(`  [driver] cli-path:   ${cliPath}`);

const ENTER = "\r";
const ARROW_LEFT = "\x1b[D";
const ARROW_DOWN = "\x1b[B";

function stripAnsi(s: string): string {
	return s
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "");
}

function shEscape(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

// BSD (macOS) and util-linux script(1) take different arguments.
function spawnViaScript() {
	const env = {
		...process.env,
		HOME: cliHome,
		FORCE_COLOR: "0",
		NO_COLOR: "1",
		TERM: "xterm-256color",
	};
	const cliArgs = [nodeBin, cliPath, "init", "--dev"];

	if (process.platform === "darwin") {
		return spawn("script", ["-q", "/dev/null", ...cliArgs], {
			cwd: repoRoot,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});
	}
	// -e returns the child's exit status, -f flushes each write. With stdout
	// piped the PTY is sized 0x0 and clack wraps every character, hence stty.
	const cmd = `stty rows 40 cols 120; exec ${cliArgs.map(shEscape).join(" ")}`;
	return spawn(
		"script",
		["-q", "-e", "-f", "-c", cmd, "/dev/null"],
		{ cwd: repoRoot, env, stdio: ["pipe", "pipe", "pipe"] },
	);
}

const child = spawnViaScript();
let buffer = "";
let exited: { code: number | null; signal: NodeJS.Signals | null } | null = null;

child.stdout?.on("data", (data: Buffer) => {
	process.stderr.write(data);
	buffer += stripAnsi(data.toString("utf8"));
	if (buffer.length > 32_000) buffer = buffer.slice(-16_000);
});
child.stderr?.on("data", (data: Buffer) => process.stderr.write(data));
child.on("exit", (code, signal) => {
	exited = { code, signal };
});
child.on("error", (err) => {
	console.error(`\n  [driver] spawn error: ${err.message}`);
	process.exit(1);
});

async function waitFor(pattern: string, timeoutMs = 60_000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (exited) {
			throw new Error(
				`CLI exited (code=${exited.code}) before prompt: "${pattern}"`,
			);
		}
		const idx = buffer.indexOf(pattern);
		if (idx !== -1) {
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
	child.stdin?.write(s);
	await new Promise((r) => setTimeout(r, settleMs));
}

async function waitForExit(timeoutMs = 30_000): Promise<number> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (exited) return exited.code ?? 0;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error("CLI did not exit within timeout");
}

async function acceptDefault(prompt: string): Promise<void> {
	await waitFor(prompt);
	await send(ENTER);
}

async function answer(prompt: string, text: string): Promise<void> {
	await waitFor(prompt);
	await send(`${text}${ENTER}`);
}

async function confirm(prompt: string, choice: boolean, { defaultAnswer }: { defaultAnswer: boolean }): Promise<void> {
	await waitFor(prompt);
	if (choice !== defaultAnswer) await send(ARROW_LEFT);
	await send(ENTER);
}

async function main(): Promise<void> {
	await acceptDefault("Path to docker directory");
	await acceptDefault("PostgreSQL connection");

	// "Custom" rather than "Recommended", to exercise the multi-provider path
	// with placeholder keys.
	await waitFor("Setup mode");
	await send(ARROW_DOWN);
	await send(ENTER);

	// Two direct providers, to exercise multiple direct-provider credentials.
	await confirm("Configure OpenRouter?", false, { defaultAnswer: false });
	await confirm("Configure Anthropic API?", true, { defaultAnswer: false });
	await answer("Anthropic API key", "sk-ant-placeholder-not-used");
	await acceptDefault("Claude model");
	await confirm("Enable web search?", false, { defaultAnswer: true });
	await confirm("Configure OpenAI API?", true, { defaultAnswer: false });
	await answer("OpenAI API key", "sk-placeholder-not-used");
	await acceptDefault("OpenAI model");
	await confirm("Enable web search?", true, { defaultAnswer: true });
	await confirm("Configure Mistral API?", false, { defaultAnswer: false });

	await confirm("Configure Cloro?", false, { defaultAnswer: true });
	await confirm("Configure BrightData?", false, { defaultAnswer: false });
	await confirm("Configure Oxylabs?", false, { defaultAnswer: false });
	await confirm("Configure SearchApi?", false, { defaultAnswer: false });
	await confirm("Configure Olostep?", false, { defaultAnswer: false });

	// DataForSEO credentials without a DataForSEO target, so this run's targets
	// stay the direct providers above.
	await confirm("Configure DataForSEO?", true, { defaultAnswer: false });
	await answer("DataForSEO login", "placeholder@e2e.test");
	await answer("DataForSEO password", "placeholder-not-used");
	await waitFor("LLM Providers to track via DataForSEO");
	await send(" ");
	await send(ENTER);

	await confirm("Edit SCRAPE_TARGETS before saving?", false, { defaultAnswer: false });

	// The stub judges locally, so the e2e stack calls no one.
	await acceptDefault("How should Elmo call Jev?");
	await answer("TypeSafe API key", "stub");

	await confirm("Share telemetry?", false, { defaultAnswer: true });
	await acceptDefault("email to receive product updates");
	await acceptDefault("How will you access Elmo?");
	await acceptDefault("Web app port");
	await confirm("Start the stack now?", false, { defaultAnswer: true });

	const code = await waitForExit();
	if (code !== 0) {
		throw new Error(`CLI exited with code ${code}`);
	}
	console.error("\n  [driver] CLI completed successfully");
}

const overallTimeout = setTimeout(() => {
	console.error("\n  [driver] TIMEOUT: wizard did not complete within 120s");
	try {
		child.kill("SIGTERM");
	} catch {}
	process.exit(1);
}, 120_000);
overallTimeout.unref();

main().catch((err) => {
	console.error(
		`\n  [driver] ERROR: ${err instanceof Error ? err.message : err}`,
	);
	try {
		child.kill("SIGTERM");
	} catch {}
	process.exit(1);
});
