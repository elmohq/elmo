import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	applyDeploymentRelease,
	captureDeploymentConfig,
	getTargetElmoImages,
	restoreDeploymentConfig,
} from "./upgrade-release";

const temporaryDirectories: string[] = [];

async function deploymentDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "elmo-release-"));
	temporaryDirectories.push(directory);
	await writeFile(
		join(directory, "elmo.yaml"),
		`# Rendered by elmo 0.2.17 on old\nservices:\n  web:\n    image: elmohq/elmo-web:0.2.17\n  worker:\n    image: elmohq/elmo-worker:0.2.17\n`,
		"utf8",
	);
	await writeFile(join(directory, ".env"), "# Rendered by elmo 0.2.17 on old\nSECRET=old\n", "utf8");
	await chmod(join(directory, "elmo.yaml"), 0o640);
	await chmod(join(directory, ".env"), 0o600);
	return directory;
}

describe("deployment release files", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("applies reconciled env and target pins, then restores the exact prior files", async () => {
		const directory = await deploymentDirectory();
		const snapshot = await captureDeploymentConfig(directory);
		await writeFile(join(directory, ".env"), "# Rendered by elmo 0.2.18 on staged\nSECRET=old\nADDED=yes\n", "utf8");

		await applyDeploymentRelease(directory, snapshot, "0.2.18");
		expect(await readFile(join(directory, "elmo.yaml"), "utf8")).toContain("elmohq/elmo-web:0.2.18");
		expect(await readFile(join(directory, ".env"), "utf8")).toContain("ADDED=yes");
		expect((await stat(join(directory, "elmo.yaml"))).mode & 0o777).toBe(0o640);

		await restoreDeploymentConfig(directory, snapshot);
		expect(await readFile(join(directory, "elmo.yaml"), "utf8")).toBe(snapshot.compose.contents);
		expect(await readFile(join(directory, ".env"), "utf8")).toBe(snapshot.env.contents);
		expect((await stat(join(directory, ".env"))).mode & 0o777).toBe(0o600);
	});

	it("discovers every pinned Elmo image plus the target migrator", () => {
		const compose = `
services:
  web:
    image: elmohq/elmo-web:old
  worker:
    image: elmohq/elmo-worker@sha256:abc
  postgres:
    image: postgres:16-alpine
`;
		expect(getTargetElmoImages(compose, "1.2.3")).toEqual([
			"elmohq/elmo-db-migrate:1.2.3",
			"elmohq/elmo-web:1.2.3",
			"elmohq/elmo-worker:1.2.3",
		]);
	});

	it("rejects managed config symlinks before a cutover snapshot is accepted", async () => {
		const directory = await deploymentDirectory();
		const managedEnv = join(directory, "managed.env");
		await writeFile(managedEnv, "SECRET=managed\n", "utf8");
		await rm(join(directory, ".env"));
		await symlink(managedEnv, join(directory, ".env"));

		await expect(captureDeploymentConfig(directory)).rejects.toThrow(/symbolic link/);
	});
});
