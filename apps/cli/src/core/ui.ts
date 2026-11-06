import { format } from "node:util";
import pc from "picocolors";
import { terminalSafe } from "./output.js";

// Messages can carry model- and website-derived text, so they're stripped of control characters
// before any styling is added; the styling itself is the only escape sequence that reaches the terminal.
function forStderr(text: string): string {
	return process.stderr.isTTY ? terminalSafe(text) : text;
}

/**
 * Human-facing messages for the `lab` commands go to **stderr** so that the
 * machine-readable result (CSV / markdown / JSON) printed to **stdout** stays
 * clean for piping. Never log progress to stdout in a lab command.
 */
export const log = {
	info: (msg: string) => process.stderr.write(`${pc.dim("›")} ${forStderr(msg)}\n`),
	step: (msg: string) => process.stderr.write(`${pc.cyan("›")} ${forStderr(msg)}\n`),
	warn: (msg: string) => process.stderr.write(`${pc.yellow("!")} ${forStderr(msg)}\n`),
	error: (msg: string) => process.stderr.write(`${pc.red("✗")} ${forStderr(msg)}\n`),
	success: (msg: string) => process.stderr.write(`${pc.green("✓")} ${forStderr(msg)}\n`),
};

/**
 * Library code in `@workspace/lib` (onboarding, providers) logs progress via
 * `console.log`/`console.info`, which write to **stdout**. The lab commands put
 * their machine-readable result on stdout, so redirect those library logs to
 * stderr to keep piped output clean. `console.error`/`console.warn` already go
 * to stderr, but are routed here too so they get the same terminal filtering.
 */
export function routeLibraryLogsToStderr(): void {
	const toErr = (...args: unknown[]) => {
		process.stderr.write(forStderr(`${format(...args)}\n`));
	};
	console.log = toErr;
	console.info = toErr;
	console.debug = toErr;
	console.warn = toErr;
	console.error = toErr;
}
