import crypto from "node:crypto";
import * as p from "@clack/prompts";

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

export const log = {
	info: (msg: string) => p.log.info(msg),
	warn: (msg: string) => p.log.warn(msg),
	error: (msg: string) => p.log.error(msg),
	success: (msg: string) => p.log.success(msg),
	step: (msg: string) => p.log.step(msg),
};

export function assertNotCancelled<T>(value: T | symbol): asserts value is T {
	if (p.isCancel(value)) {
		p.cancel("Setup cancelled.");
		process.exit(0);
	}
}

export function generateSecret(bytes = 32, encoding: BufferEncoding = "base64url"): string {
	return crypto.randomBytes(bytes).toString(encoding);
}

export function link(text: string, url: string): string {
	// OSC 8 hyperlink: clickable in iTerm2, Windows Terminal, GNOME Terminal, etc.
	// Falls back to plain text in unsupported terminals.
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function indentBlock(block: string, spaces: number): string {
	const indent = " ".repeat(spaces);
	return block
		.split("\n")
		.map((line) => `${indent}${line}`)
		.join("\n");
}
