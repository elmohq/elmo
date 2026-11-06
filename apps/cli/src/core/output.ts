import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { reachedThroughSymlink } from "./paths.js";

export type DataFormat = "csv" | "jsonl";

export function parseFormat(value: string | undefined): DataFormat {
	const v = (value ?? "csv").toLowerCase();
	if (v !== "csv" && v !== "jsonl") {
		throw new Error(`Unknown --format "${value}". Use "csv" or "jsonl".`);
	}
	return v;
}

// Output defaults to the working directory, which may be a checkout someone else wrote, so a planted
// link there can't redirect artifacts (or the cleanup before them) to somewhere outside it.
export async function ensureDir(dir: string): Promise<void> {
	const refuse = () => new Error(`Refusing to write to ${dir}: it is reached through a symlink.`);
	if (await reachedThroughSymlink(dir, { allowMissing: true })) throw refuse();
	await fs.mkdir(dir, { recursive: true });
	if (await reachedThroughSymlink(dir)) throw refuse();
}

// Written to a fresh file and renamed into place: a rename replaces whatever entry has the artifact's
// name, so an existing symlink is swapped out rather than followed to the file it points at.
export async function writeText(dir: string, name: string, content: string): Promise<string> {
	await ensureDir(dir);
	const filePath = path.join(dir, name);
	const tempPath = path.join(dir, `.${name}.${randomUUID()}.tmp`);
	try {
		await fs.writeFile(tempPath, content, { encoding: "utf8", flag: "wx" });
		await fs.rename(tempPath, filePath);
	} catch (error) {
		await fs.rm(tempPath, { force: true });
		throw error;
	}
	return filePath;
}

export function slugify(value: string, maxLen = 48): string {
	const slug = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, maxLen)
		.replace(/-+$/g, "");
	return slug || "prompt";
}

export function pad(n: number, width = 3): string {
	return String(n).padStart(width, "0");
}

function csvCell(value: unknown): string {
	let str: string;
	// Only text-origin cells can carry formula-injection payloads; numbers and
	// booleans are emitted verbatim so legitimate values (e.g. negatives) aren't
	// mangled.
	let isText = true;
	if (value === null || value === undefined) {
		str = "";
	} else if (typeof value === "number" || typeof value === "boolean") {
		str = String(value);
		isText = false;
	} else if (Array.isArray(value)) {
		str = value.join("; ");
	} else if (typeof value === "object") {
		str = JSON.stringify(value);
	} else {
		str = String(value);
	}
	// Neutralize spreadsheet formula injection: prompts, citation titles, and
	// fan-out queries are LLM/web-derived and may start with =, +, -, @, etc.
	if (isText && /^[=+\-@\t\r]/.test(str)) {
		str = `'${str}`;
	}
	if (/[",\n\r]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

export type Row = Record<string, unknown>;

export function toCsv(rows: Row[], columns: string[]): string {
	const header = columns.map(csvCell).join(",");
	const body = rows.map((row) => columns.map((col) => csvCell(row[col])).join(","));
	return [header, ...body].join("\n");
}

export function toJsonl(rows: Row[]): string {
	return rows.map((row) => JSON.stringify(row)).join("\n");
}

export function serialize(rows: Row[], columns: string[], format: DataFormat): string {
	return format === "csv" ? toCsv(rows, columns) : toJsonl(rows);
}

export async function writeStructured(
	dir: string,
	baseName: string,
	rows: Row[],
	columns: string[],
	format: DataFormat,
): Promise<string> {
	const ext = format === "csv" ? "csv" : "jsonl";
	return writeText(dir, `${baseName}.${ext}`, `${serialize(rows, columns, format)}\n`);
}

export async function writeJson(dir: string, name: string, value: unknown): Promise<string> {
	return writeText(dir, name, `${JSON.stringify(value, null, 2)}\n`);
}

// Prompts, model answers, and website text are untrusted, so a terminal gets them without control characters:
// an escape sequence could otherwise rewrite the screen or the clipboard. Pipes get the bytes unchanged.
export function terminalSafe(text: string): string {
	return [...text]
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
			return !isControl || character === "\n" || character === "\t";
		})
		.join("");
}

export function printStdout(content: string): void {
	const text = content.endsWith("\n") ? content : `${content}\n`;
	process.stdout.write(process.stdout.isTTY ? terminalSafe(text) : text);
}

export function printCsv(rows: Row[], columns: string[]): void {
	printStdout(toCsv(rows, columns));
}
