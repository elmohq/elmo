import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { databaseTargetFingerprint, deploymentUpgradeIdentity } from "./upgrade-storage.js";

const temporaryDirectories: string[] = [];

describe("deployment upgrade identity", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("allows credential rotation but fences a different database target", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "elmo-upgrade-identity-"));
		temporaryDirectories.push(configDir);
		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret-a@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:direct-a@direct-db:5432/elmo\n",
			"utf8",
		);
		const initial = await deploymentUpgradeIdentity(configDir);

		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret-b@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:direct-b@direct-db:5432/elmo\n",
			"utf8",
		);
		const rotatedCredentials = await deploymentUpgradeIdentity(configDir);
		expect(rotatedCredentials.databaseFingerprint).toBe(initial.databaseFingerprint);
		expect(rotatedCredentials.deploymentKey).toBe(initial.deploymentKey);

		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://user:secret-b@db:5432/another\nDATABASE_URL_UNPOOLED=postgres://user:direct-b@direct-db:5432/elmo\n",
			"utf8",
		);
		const differentDatabase = await deploymentUpgradeIdentity(configDir);
		expect(differentDatabase.databaseFingerprint).not.toBe(initial.databaseFingerprint);
		expect(differentDatabase.deploymentKey).not.toBe(initial.deploymentKey);

		await writeFile(
			join(configDir, ".env"),
			"DEPLOYMENT_ID=deployment-a\nDATABASE_URL=postgres://other:secret-b@db:5432/elmo\nDATABASE_URL_UNPOOLED=postgres://user:direct-b@direct-db:5432/elmo\n",
			"utf8",
		);
		const differentRole = await deploymentUpgradeIdentity(configDir);
		expect(differentRole.databaseFingerprint).not.toBe(initial.databaseFingerprint);
		expect(differentRole.deploymentKey).not.toBe(initial.deploymentKey);
	});

	it("fingerprints effective query routing without reading container-only TLS files", () => {
		const initial = databaseTargetFingerprint(
			"postgres://authority-a:secret-a@ignored-a:5432/elmo?host=effective.example&port=5444&user=runtime&sslcert=/run/secrets/missing-a.crt&sslkey=/run/secrets/missing-a.key",
			"DATABASE_URL_UNPOOLED",
		);
		const equivalent = databaseTargetFingerprint(
			"postgres://authority-b:secret-b@ignored-b:6432/elmo?host=effective.example&port=5444&user=runtime&sslcert=/run/secrets/missing-b.crt&sslkey=/run/secrets/missing-b.key",
			"DATABASE_URL_UNPOOLED",
		);
		const differentEffectiveHost = databaseTargetFingerprint(
			"postgres://authority-b:secret-b@ignored-b:6432/elmo?host=other.example&port=5444&user=runtime&sslcert=/run/secrets/missing-b.crt&sslkey=/run/secrets/missing-b.key",
			"DATABASE_URL_UNPOOLED",
		);

		expect(equivalent).toBe(initial);
		expect(differentEffectiveHost).not.toBe(initial);
	});
});
