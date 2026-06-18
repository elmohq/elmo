import pc from "picocolors";

/**
 * OSC 8 hyperlink: clickable in iTerm2, Windows Terminal, GNOME Terminal, etc.
 * Falls back to plain text in unsupported terminals.
 */
export function link(text: string, url: string): string {
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

const ELMO_ASCII = [
	"",
	"      ▄▄                ",
	"      ██                ",
	"▄█▀█▄ ██ ███▄███▄ ▄███▄ ",
	"██▄█▀ ██ ██ ██ ██ ██ ██ ",
	"▀█▄▄▄ ██ ██ ██ ██ ▀███▀ ",
	"",
].join("\n");

export function printBanner(): void {
	// text-blue-600 ≈ #2563EB → RGB(37, 99, 235)
	const blue = "\x1b[38;2;37;99;235m";
	const reset = "\x1b[0m";
	console.log(`${blue}${ELMO_ASCII}${reset}`);
}

/**
 * Human-facing messages for the `lab` commands go to **stderr** so that the
 * machine-readable result (CSV / markdown / JSON) printed to **stdout** stays
 * clean for piping. Never log progress to stdout in a lab command.
 */
export const log = {
	info: (msg: string) => process.stderr.write(`${pc.dim("›")} ${msg}\n`),
	step: (msg: string) => process.stderr.write(`${pc.cyan("›")} ${msg}\n`),
	warn: (msg: string) => process.stderr.write(`${pc.yellow("!")} ${msg}\n`),
	error: (msg: string) => process.stderr.write(`${pc.red("✗")} ${msg}\n`),
	success: (msg: string) => process.stderr.write(`${pc.green("✓")} ${msg}\n`),
};

/**
 * Library code in `@workspace/lib` (onboarding, providers) logs progress via
 * `console.log`/`console.info`, which write to **stdout**. The lab commands put
 * their machine-readable result on stdout, so redirect those library logs to
 * stderr to keep piped output clean. `console.error`/`console.warn` already go
 * to stderr.
 */
export function routeLibraryLogsToStderr(): void {
	const toErr = (...args: unknown[]) => {
		process.stderr.write(`${args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")}\n`);
	};
	console.log = toErr as typeof console.log;
	console.info = toErr as typeof console.info;
	console.debug = toErr as typeof console.debug;
}
