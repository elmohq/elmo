import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function writeTextFileAtomically(filePath: string, contents: string, mode: number): Promise<void> {
	const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
	try {
		await fs.writeFile(temporaryPath, contents, { encoding: "utf8", mode, flag: "wx" });
		await fs.rename(temporaryPath, filePath);
	} finally {
		await fs.rm(temporaryPath, { force: true });
	}
}
