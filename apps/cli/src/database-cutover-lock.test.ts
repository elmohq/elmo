import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
	acquireUpgradeCutoverLock,
	assertUpgradeCutoverLockOwned,
	buildUpgradeCutoverLockOverride,
	createSourceRuntimeFenceIdentity,
	createUpgradeCutoverLockIdentity,
	releaseUpgradeCutoverLock,
	UPGRADE_CUTOVER_LOCK_DATABASE_LABEL,
	UPGRADE_CUTOVER_LOCK_DEPLOYMENT_LABEL,
	UPGRADE_CUTOVER_LOCK_GENERATION_LABEL,
	UPGRADE_CUTOVER_LOCK_MARKER_LABEL,
	UPGRADE_CUTOVER_LOCK_OWNER_LABEL,
	UPGRADE_CUTOVER_LOCK_ROLE_LABEL,
	UPGRADE_CUTOVER_LOCK_SERVICE_NAME,
	UPGRADE_CUTOVER_LOCK_TARGET_LABEL,
	UPGRADE_CUTOVER_LOCK_UNAVAILABLE_EXIT_CODE,
} from "./database-cutover-lock.js";

const temporaryDirectories: string[] = [];
const targetVersion = "1.2.3";
const migrationImageId = `sha256:${"a".repeat(64)}`;

async function temporaryConfigDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "elmo-cutover-lock-"));
	temporaryDirectories.push(directory);
	await writeFile(
		join(directory, ".env"),
		"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret@postgres:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:secret@postgres:5432/elmo\n",
		"utf8",
	);
	await writeFile(
		join(directory, "elmo.yaml"),
		"services:\n  postgres:\n    image: postgres:16-alpine\n  db-migrate:\n    image: elmohq/elmo-db-migrate:test\n",
		"utf8",
	);
	return directory;
}

function missingContainer(): Error {
	return new Error("Error: No such object");
}

function inspect(
	identity: Awaited<ReturnType<typeof createUpgradeCutoverLockIdentity>>,
	status: string,
	health = "healthy",
	exitCode = 0,
): string {
	return JSON.stringify([
		{
			Name: `/${identity.containerName}`,
			Image: migrationImageId,
			Config: {
				Labels: {
					[UPGRADE_CUTOVER_LOCK_MARKER_LABEL]: "true",
					"com.elmohq.elmo.upgrade-config": identity.configKey,
					[UPGRADE_CUTOVER_LOCK_DEPLOYMENT_LABEL]: identity.deploymentKey,
					[UPGRADE_CUTOVER_LOCK_DATABASE_LABEL]: identity.databaseFingerprint,
					[UPGRADE_CUTOVER_LOCK_OWNER_LABEL]: identity.ownerToken,
					[UPGRADE_CUTOVER_LOCK_ROLE_LABEL]: identity.lockRole,
					[UPGRADE_CUTOVER_LOCK_TARGET_LABEL]: targetVersion,
					...(identity.runtimeFenceGeneration
						? { [UPGRADE_CUTOVER_LOCK_GENERATION_LABEL]: identity.runtimeFenceGeneration }
						: {}),
				},
			},
			State: { Status: status, ExitCode: exitCode, Health: { Status: health } },
		},
	]);
}

function overridePath(args: string[] | undefined, configDir: string): string {
	const value = args?.[1];
	if (!value) throw new Error("Compose override was not supplied");
	expect(value).toMatch(/\.elmo-upgrade-cutover-lock-[0-9a-f-]+\.yaml$/u);
	expect(value.startsWith(`${configDir}/`)).toBe(true);
	return value;
}

describe("database-scoped deployment cutover lock", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("uses the exact prepared migrator image on the Compose network", () => {
		const document = parse(buildUpgradeCutoverLockOverride({ migrationImageId, managedPostgres: true })) as {
			services: Record<string, Record<string, unknown>>;
		};
		expect(document.services[UPGRADE_CUTOVER_LOCK_SERVICE_NAME]).toMatchObject({
			image: migrationImageId,
			pull_policy: "never",
			restart: "no",
			command: ["./node_modules/.bin/tsx", "scripts/hold-cutover-lock.ts"],
			environment: {
				DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
				ELMO_CUTOVER_LOCK_READY_FILE: "/tmp/elmo-upgrade-cutover-lock-ready",
			},
			depends_on: { postgres: { condition: "service_healthy" } },
		});
		expect(document.services[UPGRADE_CUTOVER_LOCK_SERVICE_NAME]?.healthcheck).toBeDefined();
	});

	it("keeps a stable path-scoped container name if deployment configuration changes", async () => {
		const configDir = await temporaryConfigDirectory();
		const before = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");
		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-b\nDATABASE_URL=postgres://other:secret@db.example:5432/other\nDATABASE_URL_UNPOOLED=postgres://other:secret@db.example:5432/other\n",
			"utf8",
		);
		const after = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");

		expect(after.containerName).toBe(before.containerName);
		expect(after.configKey).toBe(before.configKey);
		expect(after.deploymentKey).not.toBe(before.deploymentKey);
		expect(after.databaseFingerprint).not.toBe(before.databaseFingerprint);
	});

	it("uses a distinct generation-derived source fence in the same prepared image", async () => {
		const configDir = await temporaryConfigDirectory();
		const identity = await createSourceRuntimeFenceIdentity(
			configDir,
			"pre-0020",
			"00000000-0000-4000-8000-000000000000",
		);
		const document = parse(
			buildUpgradeCutoverLockOverride({
				migrationImageId,
				runtimeFenceGeneration: identity.runtimeFenceGeneration,
			}),
		) as { services: Record<string, Record<string, unknown>> };
		expect(document.services[UPGRADE_CUTOVER_LOCK_SERVICE_NAME]).toMatchObject({
			environment: {
				ELMO_CUTOVER_RUNTIME_FENCE_GENERATION: "pre-0020",
			},
			healthcheck: { start_period: "35s" },
		});
		expect(identity.containerName).toMatch(/^elmo-upgrade-source-fence-/u);
		const laterIdentity = await createSourceRuntimeFenceIdentity(
			configDir,
			"pre-0021",
			"00000000-0000-4000-8000-000000000001",
		);
		expect(laterIdentity.containerName).not.toBe(identity.containerName);
	});

	it("launches a uniquely owned lock and waits for database-backed health", async () => {
		const configDir = await temporaryConfigDirectory();
		const identity = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");
		const observedOverrides: string[] = [];
		const runCompose = vi.fn(async (args: string[]) => {
			observedOverrides.push(await readFile(overridePath(args, configDir), "utf8"));
		});
		const capture = vi
			.fn<(args: string[]) => Promise<string>>()
			.mockRejectedValueOnce(missingContainer())
			.mockResolvedValueOnce(inspect(identity, "running"));

		await acquireUpgradeCutoverLock({
			configDir,
			identity,
			targetVersion,
			migrationImageId,
			capture,
			run: vi.fn(async () => undefined),
			runCompose,
		});

		const args = runCompose.mock.calls[0]?.[0];
		expect(args?.slice(2)).toEqual(
			expect.arrayContaining([
				"run",
				"--detach",
				"--name",
				identity.containerName,
				"--label",
				`${UPGRADE_CUTOVER_LOCK_OWNER_LABEL}=${identity.ownerToken}`,
				"--pull",
				"never",
				UPGRADE_CUTOVER_LOCK_SERVICE_NAME,
			]),
		);
		expect(observedOverrides[0]).toContain(`image: ${migrationImageId}`);
		expect((await readdir(configDir)).filter((entry) => entry.includes("cutover-lock-"))).toEqual([]);
	});

	it("recovers an already healthy owned lock without replacing its database session", async () => {
		const configDir = await temporaryConfigDirectory();
		const identity = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");
		const capture = vi.fn(async () => inspect(identity, "running"));
		const run = vi.fn(async () => undefined);
		const runCompose = vi.fn(async () => undefined);

		await acquireUpgradeCutoverLock({
			configDir,
			identity,
			targetVersion,
			migrationImageId,
			capture,
			run,
			runCompose,
		});

		expect(run).not.toHaveBeenCalled();
		expect(runCompose).not.toHaveBeenCalled();
	});

	it("removes a terminal owned container and reacquires after a daemon restart", async () => {
		const configDir = await temporaryConfigDirectory();
		const identity = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");
		const capture = vi
			.fn<(args: string[]) => Promise<string>>()
			.mockResolvedValueOnce(inspect(identity, "exited", "unhealthy", 143))
			.mockResolvedValueOnce(inspect(identity, "running"));
		const run = vi.fn(async () => undefined);
		const runCompose = vi.fn(async () => undefined);

		await acquireUpgradeCutoverLock({
			configDir,
			identity,
			targetVersion,
			migrationImageId,
			capture,
			run,
			runCompose,
		});

		expect(run).toHaveBeenCalledWith(["container", "rm", identity.containerName]);
		expect(runCompose).toHaveBeenCalledOnce();
	});

	it("fails fast when another process owns the database advisory lock", async () => {
		const configDir = await temporaryConfigDirectory();
		const identity = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");
		const capture = vi
			.fn<(args: string[]) => Promise<string>>()
			.mockRejectedValueOnce(missingContainer())
			.mockResolvedValueOnce(inspect(identity, "exited", "unhealthy", UPGRADE_CUTOVER_LOCK_UNAVAILABLE_EXIT_CODE));
		const run = vi.fn(async () => undefined);

		await expect(
			acquireUpgradeCutoverLock({
				configDir,
				identity,
				targetVersion,
				migrationImageId,
				capture,
				run,
				runCompose: vi.fn(async () => undefined),
			}),
		).rejects.toThrow(/another Elmo upgrade already owns/i);
		expect(run).toHaveBeenCalledWith(["container", "rm", identity.containerName]);
	});

	it("refuses a foreign or substituted lock container", async () => {
		const configDir = await temporaryConfigDirectory();
		const identity = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");
		const foreign = JSON.parse(inspect(identity, "running")) as Array<{
			Config: { Labels: Record<string, string> };
		}>;
		foreign[0]!.Config.Labels[UPGRADE_CUTOVER_LOCK_OWNER_LABEL] = "someone-else";

		await expect(
			assertUpgradeCutoverLockOwned({
				identity,
				targetVersion,
				migrationImageId,
				capture: vi.fn(async () => JSON.stringify(foreign)),
			}),
		).rejects.toThrow(/not the database cutover lock owned by this upgrade/);
	});

	it("releases only a healthy owned session and requires its clean exit", async () => {
		const configDir = await temporaryConfigDirectory();
		const identity = await createUpgradeCutoverLockIdentity(configDir, "00000000-0000-4000-8000-000000000000");
		const capture = vi
			.fn<(args: string[]) => Promise<string>>()
			.mockResolvedValueOnce(inspect(identity, "running"))
			.mockResolvedValueOnce(inspect(identity, "running"))
			.mockResolvedValueOnce(inspect(identity, "exited", "unhealthy", 0));
		const run = vi.fn(async () => undefined);

		await releaseUpgradeCutoverLock({
			identity,
			targetVersion,
			migrationImageId,
			capture,
			run,
		});

		expect(run.mock.calls).toEqual([
			[["container", "stop", "--time", "30", identity.containerName]],
			[["container", "rm", identity.containerName]],
		]);
	});
});
