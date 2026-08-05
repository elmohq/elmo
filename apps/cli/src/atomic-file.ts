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
	if (destination && !destination.isFile()) {
		throw new Error(`Refusing to replace non-regular file ${filePath}`);
	}
	try {
		const temporaryFile = await fs.open(temporaryPath, "wx", mode);
		try {
			await temporaryFile.writeFile(contents, { encoding: "utf8" });
			if (destination && process.platform !== "win32") {
				await temporaryFile.chown(Number(destination.uid), Number(destination.gid));
			}
			await temporaryFile.chmod(mode);
			await temporaryFile.sync();
		} finally {
			await temporaryFile.close();
		}
		await fs.rename(temporaryPath, filePath);
		await syncDirectory(path.dirname(filePath));
	} finally {
		await fs.rm(temporaryPath, { force: true });
	}
}

export async function writeNewTextFileDurably(filePath: string, contents: string, mode: number): Promise<void> {
	let created = false;
	let durable = false;
	try {
		const file = await fs.open(filePath, "wx", mode);
		created = true;
		try {
			await file.writeFile(contents, { encoding: "utf8" });
			await file.chmod(mode);
			await file.sync();
		} finally {
			await file.close();
		}
		await syncDirectory(path.dirname(filePath));
		durable = true;
	} finally {
		if (created && !durable) {
			await fs.rm(filePath, { force: true }).catch(() => undefined);
			await syncDirectory(path.dirname(filePath)).catch(() => undefined);
		}
	}
}

export async function syncDirectory(directory: string): Promise<void> {
	if (process.platform === "win32") return;
	const handle = await fs.open(directory, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}
