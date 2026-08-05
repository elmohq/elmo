import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function writeTextFileAtomically(filePath: string, contents: string, mode: number): Promise<void> {
	const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
	let destination: Awaited<ReturnType<typeof fs.lstat>> | undefined;
	try {
		destination = await fs.lstat(filePath);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
	}
	if (destination?.isSymbolicLink()) {
		throw new Error(`Refusing to replace symbolic link ${filePath}; update its managed target directly`);
	}
	try {
		await fs.writeFile(temporaryPath, contents, { encoding: "utf8", mode, flag: "wx" });
		if (destination && process.platform !== "win32") {
			await fs.chown(temporaryPath, Number(destination.uid), Number(destination.gid));
		}
		await fs.chmod(temporaryPath, mode);
		await fs.rename(temporaryPath, filePath);
	} finally {
		await fs.rm(temporaryPath, { force: true });
	}
}
