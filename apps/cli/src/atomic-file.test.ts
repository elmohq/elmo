import { lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeTextFileAtomically } from "./atomic-file.js";

const temporaryDirectories: string[] = [];

describe("atomic config writes", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("preserves the owner and group of a replaced config file", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-atomic-"));
		temporaryDirectories.push(directory);
		const filePath = join(directory, ".env");
		await writeFile(filePath, "OLD=yes\n", { mode: 0o640 });
		const before = await stat(filePath);

		await writeTextFileAtomically(filePath, "NEW=yes\n", 0o600);

		const after = await stat(filePath);
		expect(await readFile(filePath, "utf8")).toBe("NEW=yes\n");
		expect({ uid: after.uid, gid: after.gid, mode: after.mode & 0o777 }).toEqual({
			uid: before.uid,
			gid: before.gid,
			mode: 0o600,
		});
	});

	it("refuses to replace a secret-manager symlink", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-atomic-"));
		temporaryDirectories.push(directory);
		const targetPath = join(directory, "managed.env");
		const linkPath = join(directory, ".env");
		await writeFile(targetPath, "MANAGED=yes\n", "utf8");
		await symlink(targetPath, linkPath);

		await expect(writeTextFileAtomically(linkPath, "REPLACED=yes\n", 0o600)).rejects.toThrow(/symbolic link/);
		expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
		expect(await readFile(targetPath, "utf8")).toBe("MANAGED=yes\n");
	});
});
