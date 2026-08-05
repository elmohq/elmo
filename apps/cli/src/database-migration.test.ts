import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
	buildUpgradeMigrationOverride,
	prepareTargetDevelopmentMigrationImage,
	resolveDevelopmentMigrationBuild,
	runTargetDatabaseMigration,
	UPGRADE_MIGRATOR_SERVICE_NAME,
	usesDevelopmentElmoBuild,
} from "./database-migration";
import {
	createUpgradeMigratorIdentity,
	UPGRADE_MIGRATOR_DEPLOYMENT_LABEL,
	UPGRADE_MIGRATOR_MARKER_LABEL,
	UPGRADE_MIGRATOR_TARGET_LABEL,
} from "./database-migration-recovery.js";

const temporaryDirectories: string[] = [];

async function temporaryConfigDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "elmo-cli-migration-"));
	temporaryDirectories.push(directory);
	await writeFile(
		join(directory, ".env"),
		"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:secret@db:5432/elmo\n",
		"utf8",
	);
	await writeFile(
		join(directory, "elmo.yaml"),
		"services:\n  web:\n    image: elmohq/elmo-web:old\n  worker:\n    image: elmohq/elmo-worker:old\n",
		"utf8",
	);
	return directory;
}

const legacyExternalDevelopmentCompose = `
services:
  web:
    build:
      context: /source/elmo
      dockerfile: docker/Dockerfile
      target: web
      args:
        DEPLOYMENT_MODE: local
  worker:
    build:
      context: /source/elmo
      dockerfile: docker/Dockerfile
      target: worker
`;

async function migrationFenceArgs(configDir: string, version = "1.2.3"): Promise<string[]> {
	const identity = await createUpgradeMigratorIdentity(configDir);
	return [
		"--name",
		identity.containerName,
		"--label",
		`${UPGRADE_MIGRATOR_MARKER_LABEL}=true`,
		"--label",
		`${UPGRADE_MIGRATOR_DEPLOYMENT_LABEL}=${identity.deploymentKey}`,
		"--label",
		`${UPGRADE_MIGRATOR_TARGET_LABEL}=${version}`,
	];
}

function migrationOverridePath(args: string[] | undefined, configDir: string): string {
	const overridePath = args?.[1];
	if (!overridePath) throw new Error("Compose override path was not provided");
	expect(overridePath).toMatch(/^.*\/\.elmo-upgrade-migrate-[0-9a-f-]+\.yaml$/u);
	expect(overridePath.startsWith(`${configDir}/`)).toBe(true);
	return overridePath;
}

async function expectNoMigrationOverrides(configDir: string): Promise<void> {
	expect((await readdir(configDir)).filter((entry) => entry.startsWith(".elmo-upgrade-migrate-"))).toEqual([]);
}

describe("upgrade database migration runner", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("ignores unrelated build-only sidecars when classifying an image deployment", () => {
		expect(
			usesDevelopmentElmoBuild(`
services:
  web:
    image: elmohq/elmo-web:0.2.17
  worker:
    image: elmohq/elmo-worker:0.2.17
  asset-builder:
    build: ./assets
`),
		).toBe(false);
	});

	it("recognizes a development build on an Elmo service", () => {
		expect(usesDevelopmentElmoBuild(legacyExternalDevelopmentCompose)).toBe(true);
	});

	it("rejects a mixed Elmo build and image deployment before cutover", () => {
		expect(() =>
			usesDevelopmentElmoBuild(`
services:
  web:
    build: /source/elmo
  worker:
    image: elmohq/elmo-worker:0.2.17
`),
		).toThrow(/cannot mix local builds and published images/);
	});

	it("pulls and runs the target migrator through an ephemeral compose override", async () => {
		const configDir = await temporaryConfigDirectory();
		const observedOverrides: string[] = [];
		const runCompose = vi.fn(async (args: string[]) => {
			const overridePath = args[1];
			if (!overridePath) throw new Error("Compose override path was not provided");
			observedOverrides.push(await readFile(overridePath, "utf8"));
		});

		await runTargetDatabaseMigration({
			configDir,
			dev: false,
			version: "1.2.3",
			migrationImage: "elmohq/elmo-db-migrate:1.2.3",
			wasRunning: true,
			runCompose,
		});

		expect(runCompose.mock.calls.map(([args]) => args.slice(2))).toEqual([
			[
				"run",
				...(await migrationFenceArgs(configDir)),
				"--rm",
				"--pull",
				"always",
				"--no-TTY",
				UPGRADE_MIGRATOR_SERVICE_NAME,
			],
		]);
		expect(observedOverrides).toHaveLength(1);
		for (const override of observedOverrides) {
			expect(override).toContain("image: elmohq/elmo-db-migrate:1.2.3");
			expect(parse(override)).toMatchObject({
				services: {
					[UPGRADE_MIGRATOR_SERVICE_NAME]: {
						environment: {
							DATABASE_URL: `\${DATABASE_URL:?DATABASE_URL is required}`,
							DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
						},
					},
				},
			});
			expect(override).not.toContain("postgres://");
		}
		await expectNoMigrationOverrides(configDir);
	});

	it("stops temporary dependencies without deleting stopped deployment containers", async () => {
		const configDir = await temporaryConfigDirectory();
		await writeFile(join(configDir, "elmo.yaml"), legacyExternalDevelopmentCompose, "utf8");
		const runCompose = vi.fn(async (_args: string[]) => undefined);

		await runTargetDatabaseMigration({
			configDir,
			dev: true,
			version: "1.2.3",
			wasRunning: false,
			runCompose,
		});

		const overridePath = migrationOverridePath(runCompose.mock.calls[0]?.[0], configDir);
		expect(runCompose.mock.calls.map(([args]) => args)).toEqual([
			["-f", overridePath, "build", UPGRADE_MIGRATOR_SERVICE_NAME],
			[
				"-f",
				overridePath,
				"run",
				...(await migrationFenceArgs(configDir)),
				"--rm",
				"--pull",
				"never",
				"--no-TTY",
				UPGRADE_MIGRATOR_SERVICE_NAME,
			],
			["stop", "--timeout", "3900"],
		]);
	});

	it("uses the pre-pulled migrator without network access during cutover", async () => {
		const configDir = await temporaryConfigDirectory();
		const runCompose = vi.fn(async (_args: string[]) => undefined);

		await runTargetDatabaseMigration({
			configDir,
			dev: false,
			version: "1.2.3",
			migrationImage: "elmohq/elmo-db-migrate:1.2.3",
			wasRunning: true,
			imagePrepared: true,
			runCompose,
		});

		const overridePath = migrationOverridePath(runCompose.mock.calls[0]?.[0], configDir);
		expect(runCompose.mock.calls[0]?.[0]).toEqual([
			"-f",
			overridePath,
			"run",
			...(await migrationFenceArgs(configDir)),
			"--rm",
			"--pull",
			"never",
			"--no-TTY",
			UPGRADE_MIGRATOR_SERVICE_NAME,
		]);
	});

	it("keeps temporary database dependencies alive while the cutover lock is held", async () => {
		const configDir = await temporaryConfigDirectory();
		const runCompose = vi.fn(async (_args: string[]) => undefined);

		await runTargetDatabaseMigration({
			configDir,
			dev: false,
			version: "1.2.3",
			migrationImage: "elmohq/elmo-db-migrate:1.2.3",
			wasRunning: false,
			preserveDependencies: true,
			runCompose,
		});

		expect(runCompose).toHaveBeenCalledTimes(1);
		expect(runCompose.mock.calls.flatMap(([args]) => args)).not.toContain("stop");
	});

	it("pre-builds a synthesized development migrator before maintenance", async () => {
		const configDir = await temporaryConfigDirectory();
		await writeFile(join(configDir, "elmo.yaml"), legacyExternalDevelopmentCompose, "utf8");
		const runCompose = vi.fn(async (_args: string[]) => undefined);
		const captureCompose = vi.fn(async (_args: string[]) => "elmo-upgrade-migrator\n");

		await expect(
			prepareTargetDevelopmentMigrationImage({ configDir, version: "1.2.3", captureCompose, runCompose }),
		).resolves.toBe("elmo-upgrade-migrator\n");

		const overridePath = migrationOverridePath(runCompose.mock.calls[0]?.[0], configDir);
		expect(runCompose).toHaveBeenCalledWith([
			"-f",
			overridePath,
			"build",
			"--build-arg",
			"ELMO_RELEASE_VERSION=1.2.3",
			UPGRADE_MIGRATOR_SERVICE_NAME,
		]);
		expect(captureCompose).toHaveBeenCalledWith([
			"-f",
			overridePath,
			"config",
			"--images",
			UPGRADE_MIGRATOR_SERVICE_NAME,
		]);
		await expectNoMigrationOverrides(configDir);
	});

	it("uses the pre-built development migrator during cutover", async () => {
		const configDir = await temporaryConfigDirectory();
		await writeFile(join(configDir, "elmo.yaml"), legacyExternalDevelopmentCompose, "utf8");
		let observedOverride = "";
		const runCompose = vi.fn(async (args: string[]) => {
			observedOverride = await readFile(migrationOverridePath(args, configDir), "utf8");
		});

		await runTargetDatabaseMigration({
			configDir,
			dev: true,
			version: "1.2.3",
			migrationImage: "sha256:abc123",
			wasRunning: true,
			imagePrepared: true,
			runCompose,
		});

		expect(runCompose).toHaveBeenCalledTimes(1);
		expect(runCompose.mock.calls[0]?.[0]).not.toContain("build");
		expect(observedOverride).toContain("image: sha256:abc123");
	});

	it("refuses an unidentifiable pre-built development migrator", async () => {
		const configDir = await temporaryConfigDirectory();
		await writeFile(join(configDir, "elmo.yaml"), legacyExternalDevelopmentCompose, "utf8");

		await expect(
			runTargetDatabaseMigration({
				configDir,
				dev: true,
				version: "1.2.3",
				wasRunning: true,
				imagePrepared: true,
				runCompose: vi.fn(async () => undefined),
			}),
		).rejects.toThrow(/requires its attested image ID/);
	});

	it("does not launch a second migrator after recovering a successful in-flight run", async () => {
		const configDir = await temporaryConfigDirectory();
		const runCompose = vi.fn(async (_args: string[]) => undefined);
		const recoverExistingMigration = vi.fn(async () => true);

		await runTargetDatabaseMigration({
			configDir,
			dev: false,
			version: "1.2.3",
			migrationImage: "elmohq/elmo-db-migrate:1.2.3",
			wasRunning: true,
			recoverExistingMigration,
			runCompose,
		});

		expect(recoverExistingMigration).toHaveBeenCalledOnce();
		expect(runCompose).not.toHaveBeenCalled();
	});

	it("adds a self-contained migrator to legacy external development compose files", () => {
		const developmentBuild = resolveDevelopmentMigrationBuild(legacyExternalDevelopmentCompose);
		const override = parse(buildUpgradeMigrationOverride({ dev: true, version: "1.2.3", developmentBuild })) as {
			services: Record<string, unknown>;
		};

		expect(override.services[UPGRADE_MIGRATOR_SERVICE_NAME]).toEqual({
			build: {
				context: "/source/elmo",
				dockerfile: "docker/Dockerfile",
				target: "migrate",
				args: { DEPLOYMENT_MODE: "local" },
			},
			restart: "no",
			pull_policy: "never",
			environment: {
				DATABASE_URL: `\${DATABASE_URL:?DATABASE_URL is required}`,
				DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
			},
		});
	});

	it("leaves a running deployment alone when the target migration fails", async () => {
		const configDir = await temporaryConfigDirectory();
		const failure = new Error("migration failed");
		const runCompose = vi.fn(async (_args: string[]) => {
			throw failure;
		});

		await expect(
			runTargetDatabaseMigration({
				configDir,
				dev: false,
				version: "1.2.3",
				migrationImage: "elmohq/elmo-db-migrate:1.2.3",
				wasRunning: true,
				runCompose,
			}),
		).rejects.toBe(failure);

		expect(runCompose).toHaveBeenCalledTimes(1);
		expect(runCompose.mock.calls[0]?.[0]).not.toContain("down");
		await expectNoMigrationOverrides(configDir);
	});

	it("stops temporary dependencies without deleting containers when a stopped deployment migration fails", async () => {
		const configDir = await temporaryConfigDirectory();
		const failure = new Error("migration failed");
		const runCompose = vi.fn(async (args: string[]) => {
			if (args.includes("run")) throw failure;
		});

		await expect(
			runTargetDatabaseMigration({
				configDir,
				dev: false,
				version: "1.2.3",
				migrationImage: "elmohq/elmo-db-migrate:1.2.3",
				wasRunning: false,
				runCompose,
			}),
		).rejects.toBe(failure);

		expect(runCompose.mock.calls.at(-1)?.[0]).toEqual(expect.arrayContaining(["stop", "--timeout", "3900"]));
		expect(runCompose.mock.calls.flatMap(([args]) => args)).not.toContain("down");
	});

	it("never overwrites an operator file while creating the migration override", async () => {
		const configDir = await temporaryConfigDirectory();
		const operatorPath = join(configDir, ".elmo-upgrade-migrate.yaml");
		await writeFile(operatorPath, "operator-owned\n", "utf8");

		await runTargetDatabaseMigration({
			configDir,
			dev: false,
			version: "1.2.3",
			migrationImage: "elmohq/elmo-db-migrate:1.2.3",
			wasRunning: true,
			runCompose: vi.fn(async () => undefined),
		});

		expect(await readFile(operatorPath, "utf8")).toBe("operator-owned\n");
		await expectNoMigrationOverrides(configDir);
	});
});
