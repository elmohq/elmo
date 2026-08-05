import fs from "node:fs/promises";
import { writeTextFileAtomically } from "./atomic-file.js";

const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/u;

export function formatEnvValue(value: string): string {
	if (value === "") return '""';
	if (value.includes("$")) return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
	if (/[\s#"']/u.test(value)) {
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
}

export function appendEnvValue(contents: string, name: string, value: string): string {
	if (!ENV_NAME_PATTERN.test(name)) throw new Error(`Invalid environment variable name: ${name}`);
	const separator = contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
	return `${contents}${separator}${name}=${formatEnvValue(value)}\n`;
}

export async function setEnvFileValue(filePath: string, name: string, value: string): Promise<void> {
	const [contents, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
	await writeTextFileAtomically(filePath, appendEnvValue(contents, name, value), stats.mode & 0o777);
}
