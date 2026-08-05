import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
	buildUpgradeMigrationOverride,
	resolveDevelopmentMigrationBuild,
	runTargetDatabaseMigration,
	usesDevelopmentElmoBuild,
} from "./database-migration";

const temporaryDirectories: string[] = [];

async function temporaryConfigDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "elmo-cli-migration-"));
	temporaryDirectories.push(directory);
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
			wasRunning: true,
			runCompose,
		});

		expect(runCompose.mock.calls.map(([args]) => args.slice(2))).toEqual([
			["run", "--rm", "--pull", "always", "--no-TTY", "db-migrate"],
		]);
		expect(observedOverrides).toHaveLength(1);
		for (const override of observedOverrides) {
			expect(override).toContain("image: elmohq/elmo-db-migrate:1.2.3");
			expect(parse(override)).toMatchObject({
				services: {
					"db-migrate": {
						environment: { DATABASE_URL: `\${DATABASE_URL:?DATABASE_URL is required}` },
					},
				},
			});
			expect(override).not.toContain("postgres://");
		}
		await expect(access(join(configDir, ".elmo-upgrade-migrate.yaml"))).rejects.toThrow();
	});

	it("cleans up compose resources when a stopped deployment needed a database dependency", async () => {
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

		expect(runCompose.mock.calls.map(([args]) => args)).toEqual([
			["-f", join(configDir, ".elmo-upgrade-migrate.yaml"), "build", "db-migrate"],
			["-f", join(configDir, ".elmo-upgrade-migrate.yaml"), "run", "--rm", "--no-TTY", "db-migrate"],
			["down"],
		]);
	});

	it("uses the pre-pulled migrator without network access during cutover", async () => {
		const configDir = await temporaryConfigDirectory();
		const runCompose = vi.fn(async (_args: string[]) => undefined);

		await runTargetDatabaseMigration({
			configDir,
			dev: false,
			version: "1.2.3",
			wasRunning: true,
			imagePrepared: true,
			runCompose,
		});

		expect(runCompose.mock.calls[0]?.[0]).toEqual([
			"-f",
			join(configDir, ".elmo-upgrade-migrate.yaml"),
			"run",
			"--rm",
			"--pull",
			"never",
			"--no-TTY",
			"db-migrate",
		]);
	});

	it("adds a self-contained migrator to legacy external development compose files", () => {
		const developmentBuild = resolveDevelopmentMigrationBuild(legacyExternalDevelopmentCompose);
		const override = parse(buildUpgradeMigrationOverride({ dev: true, version: "1.2.3", developmentBuild })) as {
			services: Record<string, unknown>;
		};

		expect(override.services["db-migrate"]).toEqual({
			build: {
				context: "/source/elmo",
				dockerfile: "docker/Dockerfile",
				target: "migrate",
				args: { DEPLOYMENT_MODE: "local" },
			},
			restart: "no",
			environment: { DATABASE_URL: `\${DATABASE_URL:?DATABASE_URL is required}` },
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
				wasRunning: true,
				runCompose,
			}),
		).rejects.toBe(failure);

		expect(runCompose).toHaveBeenCalledTimes(1);
		expect(runCompose.mock.calls[0]?.[0]).not.toContain("down");
		await expect(access(join(configDir, ".elmo-upgrade-migrate.yaml"))).rejects.toThrow();
	});
});
