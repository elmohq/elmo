import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUpgradeCutoverLockIdentity } from "./database-cutover-lock.js";
import {
	advanceUpgradeRecoveryState,
	readUpgradeRecoveryState,
	reconcilePreparedTargetImageIds,
	recoveryFilePath,
	removeUpgradeRecoveryState,
	type UpgradeRecoveryState,
	writeUpgradeRecoveryState,
} from "./upgrade-recovery.js";
import { databaseConnectionIdentityFingerprint } from "./upgrade-storage.js";

const temporaryDirectories: string[] = [];

function recoveryState(): UpgradeRecoveryState {
	return {
		formatVersion: 1,
		deploymentId: "deployment-a",
		databaseFingerprint: databaseConnectionIdentityFingerprint(
			"postgres://user:secret@db:5432/elmo",
			"postgres://user:secret@db:5432/elmo",
		),
		dockerEngine: {
			daemonId: "daemon-a",
			context: "default",
			endpoint: "unix:///var/run/docker.sock",
			composeProject: "elmo",
		},
		targetVersion: "0.2.18",
		detectedVersion: "0.2.17",
		fromVersion: "0.2.17",
		requiresMaintenance: true,
		isDevelopment: false,
		previousRunningServices: ["worker", "web"],
		anyComposeServiceWasRunning: true,
		rollbackSchemaCompatibility: "0020",
		rollbackConfig: {
			compose: { contents: "services: {}\n", mode: 0o640 },
			env: { contents: "SECRET=kept\n", mode: 0o600 },
		},
		rollbackImages: [
			{ service: "web", imageId: "sha256:aa", reference: "elmohq/elmo-web:0.2.17" },
			{ service: "worker", imageId: "sha256:bb", reference: "elmohq/elmo-worker:0.2.17" },
		],
		cutoverStarted: false,
		databaseBoundaryMayHaveAdvanced: false,
		applicationServicesQuiesced: false,
		applicationContainersRemoved: false,
		developmentImages: [
			{
				service: "worker",
				imageId: "sha256:old",
				originalReference: "elmo-worker:latest",
				backupReference: "elmo-upgrade-backup:worker-id",
			},
		],
		preparedTargetImageIds: {
			dbMigrate: "sha256:a",
			web: "sha256:b",
			worker: "sha256:c",
		},
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

	it("refuses to replace prepared images while resuming", () => {
		const expected = {
			dbMigrate: "sha256:a",
			web: "sha256:b",
			worker: "sha256:c",
		};

		expect(reconcilePreparedTargetImageIds(expected, { ...expected })).toBe(expected);
		expect(() =>
			reconcilePreparedTargetImageIds(expected, {
				...expected,
				worker: "sha256:d",
			}),
		).toThrow(/Prepared worker image changed during recovery/);
	});

	it("never forgets irreversible cutover facts when a resumed phase replays", () => {
		const afterMigration = advanceUpgradeRecoveryState(recoveryState(), "migrating-database", {
			cutoverStarted: true,
			databaseBoundaryMayHaveAdvanced: true,
			applicationServicesQuiesced: true,
			applicationContainersRemoved: true,
		});
		const replayedCheckpoint = advanceUpgradeRecoveryState(afterMigration, "config-checkpointed");
		const interruptedPreparation = advanceUpgradeRecoveryState(replayedCheckpoint, "preparing-release");

		expect(interruptedPreparation).toMatchObject({
			phase: "preparing-release",
			cutoverStarted: true,
			databaseBoundaryMayHaveAdvanced: true,
			applicationServicesQuiesced: true,
			applicationContainersRemoved: true,
		});
	});

	it("durably records rollback config and prior service state with private permissions", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-recovery-"));
		temporaryDirectories.push(directory);
		const configDir = join(directory, "config");
		const storageRoot = join(directory, "state");
		await mkdir(configDir);
		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:secret@db:5432/elmo\n",
			"utf8",
		);
		const state = recoveryState();
		state.cutoverLock = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");
		const written = await writeUpgradeRecoveryState(configDir, state, storageRoot);
		const statePath = await recoveryFilePath(configDir, storageRoot);

		expect(await readUpgradeRecoveryState(configDir, storageRoot)).toEqual(written);
		expect((await stat(statePath)).mode & 0o777).toBe(0o600);
		expect((await stat(storageRoot)).mode & 0o777).toBe(0o700);
		expect(await readFile(statePath, "utf8")).toContain("SECRET=kept");
		expect(statePath.startsWith(configDir)).toBe(false);
	});

	it("discovers private recovery state after the state-root environment changes", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-recovery-"));
		temporaryDirectories.push(directory);
		const configDir = join(directory, "config");
		const firstStorageRoot = join(directory, "state-a");
		const secondStorageRoot = join(directory, "state-b");
		await mkdir(configDir);
		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:secret@db:5432/elmo\n",
			"utf8",
		);

		const written = await writeUpgradeRecoveryState(configDir, recoveryState(), firstStorageRoot);
		const originalPath = await recoveryFilePath(configDir, secondStorageRoot);

		expect(originalPath.startsWith(firstStorageRoot)).toBe(true);
		expect(await readUpgradeRecoveryState(configDir, secondStorageRoot)).toEqual(written);
		await removeUpgradeRecoveryState(configDir, secondStorageRoot);
		expect(await readUpgradeRecoveryState(configDir, firstStorageRoot)).toBeNull();
	});

	it("rejects malformed state instead of guessing how to recover", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-recovery-"));
		temporaryDirectories.push(directory);
		const configDir = join(directory, "config");
		const storageRoot = join(directory, "state");
		await mkdir(configDir);
		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:secret@db:5432/elmo\n",
			"utf8",
		);
		await writeUpgradeRecoveryState(configDir, recoveryState(), storageRoot);
		await writeFile(await recoveryFilePath(configDir, storageRoot), '{"formatVersion":1}\n', "utf8");

		await expect(readUpgradeRecoveryState(configDir, storageRoot)).rejects.toThrow(/recovery state is invalid/);
	});

	it("removes the checkpoint after a verified release or successful rollback", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-recovery-"));
		temporaryDirectories.push(directory);
		const configDir = join(directory, "config");
		const storageRoot = join(directory, "state");
		await mkdir(configDir);
		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:secret@db:5432/elmo\n",
			"utf8",
		);
		await writeUpgradeRecoveryState(configDir, recoveryState(), storageRoot);

		await removeUpgradeRecoveryState(configDir, storageRoot);

		expect(await readUpgradeRecoveryState(configDir, storageRoot)).toBeNull();
	});
});
