import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	readUpgradeRecoveryState,
	recoveryFilePath,
	removeUpgradeRecoveryState,
	type UpgradeRecoveryState,
	writeUpgradeRecoveryState,
} from "./upgrade-recovery.js";

const temporaryDirectories: string[] = [];

function recoveryState(): UpgradeRecoveryState {
	return {
		formatVersion: 1,
		targetVersion: "0.2.18",
		detectedVersion: "0.2.17",
		fromVersion: "0.2.17",
		requiresMaintenance: true,
		isDevelopment: false,
		previousRunningServices: ["worker", "web"],
		anyComposeServiceWasRunning: true,
		rollbackConfig: {
			compose: { contents: "services: {}\n", mode: 0o640 },
			env: { contents: "SECRET=kept\n", mode: 0o600 },
		},
		developmentImages: [
			{
				service: "worker",
				imageId: "sha256:old",
				originalReference: "elmo-worker:latest",
				backupReference: "elmo-upgrade-backup:worker-id",
			},
		],
		phase: "config-checkpointed",
		createdAt: "2026-08-05T00:00:00.000Z",
		updatedAt: "2026-08-05T00:00:00.000Z",
	};
}

describe("upgrade recovery state", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("durably records rollback config and prior service state with private permissions", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-recovery-"));
		temporaryDirectories.push(directory);
		const written = await writeUpgradeRecoveryState(directory, recoveryState());

		expect(await readUpgradeRecoveryState(directory)).toEqual(written);
		expect((await stat(recoveryFilePath(directory))).mode & 0o777).toBe(0o600);
		expect(await readFile(recoveryFilePath(directory), "utf8")).toContain("SECRET=kept");
	});

	it("rejects malformed state instead of guessing how to recover", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-recovery-"));
		temporaryDirectories.push(directory);
		await writeFile(recoveryFilePath(directory), '{"formatVersion":1}\n', "utf8");

		await expect(readUpgradeRecoveryState(directory)).rejects.toThrow(/recovery state is invalid/);
	});

	it("removes the checkpoint after a verified release or successful rollback", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-recovery-"));
		temporaryDirectories.push(directory);
		await writeUpgradeRecoveryState(directory, recoveryState());

		await removeUpgradeRecoveryState(directory);

		expect(await readUpgradeRecoveryState(directory)).toBeNull();
	});
});
