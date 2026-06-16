import fs from "node:fs/promises";
import path from "node:path";

export type DataFormat = "csv" | "jsonl";

export function parseFormat(value: string | undefined): DataFormat {
	const v = (value ?? "csv").toLowerCase();
	if (v !== "csv" && v !== "jsonl") {
		throw new Error(`Unknown --format "${value}". Use "csv" or "jsonl".`);
	}
	return v;
}

export async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}

/** filesystem-safe, readable slug for prompt directories (e.g. 001-best-shoes). */
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

/** Zero-pad an index for stable directory ordering (1 -> "001"). */
export function pad(n: number, width = 3): string {
	return String(n).padStart(width, "0");
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
	let str: string;
	if (value === null || value === undefined) {
		str = "";
	} else if (Array.isArray(value)) {
		str = value.join("; ");
	} else if (typeof value === "object") {
		str = JSON.stringify(value);
	} else {
		str = String(value);
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

/** Serialize structured rows in the requested format (string only — no I/O). */
export function serialize(rows: Row[], columns: string[], format: DataFormat): string {
	return format === "csv" ? toCsv(rows, columns) : toJsonl(rows);
}

/**
 * Write structured rows to `<dir>/<baseName>.<ext>` in the chosen format and
 * return the path written.
 */
export async function writeStructured(
	dir: string,
	baseName: string,
	rows: Row[],
	columns: string[],
	format: DataFormat,
): Promise<string> {
	await ensureDir(dir);
	const ext = format === "csv" ? "csv" : "jsonl";
	const filePath = path.join(dir, `${baseName}.${ext}`);
	await fs.writeFile(filePath, `${serialize(rows, columns, format)}\n`, "utf8");
	return filePath;
}

export async function writeText(dir: string, name: string, content: string): Promise<string> {
	await ensureDir(dir);
	const filePath = path.join(dir, name);
	await fs.writeFile(filePath, content, "utf8");
	return filePath;
}

export async function writeJson(dir: string, name: string, value: unknown): Promise<string> {
	return writeText(dir, name, `${JSON.stringify(value, null, 2)}\n`);
}

// ── stdout printers ──────────────────────────────────────────────────────────

export function printStdout(content: string): void {
	process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
}

export function printCsv(rows: Row[], columns: string[]): void {
	printStdout(toCsv(rows, columns));
}
