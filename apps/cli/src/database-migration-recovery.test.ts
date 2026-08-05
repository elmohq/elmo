import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	assertNoConflictingUpgradeMigrators,
	createUpgradeMigratorIdentity,
	recoverExistingUpgradeMigrator,
	UPGRADE_MIGRATOR_DEPLOYMENT_LABEL,
	UPGRADE_MIGRATOR_MARKER_LABEL,
	UPGRADE_MIGRATOR_TARGET_LABEL,
} from "./database-migration-recovery.js";

const temporaryDirectories: string[] = [];
const expectedImageId = `sha256:${"a".repeat(64)}`;

async function identity() {
	const directory = await mkdtemp(join(tmpdir(), "elmo-migrator-recovery-"));
	temporaryDirectories.push(directory);
	await mkdir(join(directory, "config"));
	await writeFile(
		join(directory, "config", ".env"),
		"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:secret@db:5432/elmo\n",
		"utf8",
	);
	return createUpgradeMigratorIdentity(join(directory, "config"));
}

function inspect(identity: Awaited<ReturnType<typeof createUpgradeMigratorIdentity>>, status: string, exitCode = 0) {
	return JSON.stringify([
		{
			Name: `/${identity.containerName}`,
			Image: expectedImageId,
			Config: {
				Labels: {
					[UPGRADE_MIGRATOR_MARKER_LABEL]: "true",
					[UPGRADE_MIGRATOR_DEPLOYMENT_LABEL]: identity.deploymentKey,
					[UPGRADE_MIGRATOR_TARGET_LABEL]: "1.2.3",
				},
			},
			State: { Status: status, ExitCode: exitCode },
		},
	]);
}

describe("interrupted database migrator recovery", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("reruns an idempotent migration when no fenced container remains", async () => {
		const migrationIdentity = await identity();
		const capture = vi.fn(async () => {
			throw new Error("Error: No such object");
		});

		await expect(
			recoverExistingUpgradeMigrator({
				identity: migrationIdentity,
				expectedImageId,
				targetVersion: "1.2.3",
				capture,
				run: vi.fn(async () => undefined),
			}),
		).resolves.toBe(false);
	});

	it("waits for and accepts the matching in-flight migration", async () => {
		const migrationIdentity = await identity();
		const capture = vi
			.fn<(args: string[]) => Promise<string>>()
			.mockResolvedValueOnce(inspect(migrationIdentity, "running"))
			.mockResolvedValueOnce("0\n");
		const run = vi.fn(async () => undefined);

		await expect(
			recoverExistingUpgradeMigrator({
				identity: migrationIdentity,
				expectedImageId,
				targetVersion: "1.2.3",
				capture,
				run,
			}),
		).resolves.toBe(true);
		expect(capture).toHaveBeenLastCalledWith(["container", "wait", migrationIdentity.containerName]);
	});

	it("rejects a failed or foreign container instead of skipping migration", async () => {
		const migrationIdentity = await identity();
		await expect(
			recoverExistingUpgradeMigrator({
				identity: migrationIdentity,
				expectedImageId,
				targetVersion: "1.2.3",
				capture: vi.fn(async () => inspect(migrationIdentity, "exited", 12)),
				run: vi.fn(async () => undefined),
			}),
		).rejects.toThrow(/exited with code 12/);

		const foreign = JSON.parse(inspect(migrationIdentity, "running")) as Array<{
			Config: { Labels: Record<string, string> };
		}>;
		foreign[0]!.Config.Labels[UPGRADE_MIGRATOR_DEPLOYMENT_LABEL] = "another-deployment";
		await expect(
			recoverExistingUpgradeMigrator({
				identity: migrationIdentity,
				expectedImageId,
				targetVersion: "1.2.3",
				capture: vi.fn(async () => JSON.stringify(foreign)),
				run: vi.fn(),
			}),
		).rejects.toThrow(/not the fenced migrator/);

		const substituted = JSON.parse(inspect(migrationIdentity, "exited")) as Array<{ Image: string }>;
		substituted[0]!.Image = `sha256:${"b".repeat(64)}`;
		await expect(
			recoverExistingUpgradeMigrator({
				identity: migrationIdentity,
				expectedImageId,
				targetVersion: "1.2.3",
				capture: vi.fn(async () => JSON.stringify(substituted)),
				run: vi.fn(),
			}),
		).rejects.toThrow(/does not use checkpointed migrator image/);
	});

	it("serializes active upgrade migrators across a Docker host", async () => {
		const migrationIdentity = await identity();
		await expect(
			assertNoConflictingUpgradeMigrators({
				identity: migrationIdentity,
				allowCurrent: false,
				capture: vi.fn(async () => "elmo-upgrade-db-migrate-someone-else\n"),
			}),
		).rejects.toThrow(/Another Elmo database upgrade is active/);
	});
});
