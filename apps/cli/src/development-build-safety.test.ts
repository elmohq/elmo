import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertRecoveryStateOutsideDevelopmentBuildContexts,
	localDevelopmentBuildContexts,
} from "./development-build-safety.js";

const temporaryDirectories: string[] = [];

describe("development upgrade build contexts", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("resolves primary and additional local contexts", () => {
		expect(
			localDevelopmentBuildContexts(
				`services:\n  web:\n    build:\n      context: ../source\n      additional_contexts:\n        assets: ../assets\n        base: docker-image://node:24\n`,
				"/deploy/config",
			),
		).toEqual(["/deploy/source", "/deploy/assets"]);
	});

	it("allows private recovery state outside every build context", async () => {
		const root = await mkdtemp(join(tmpdir(), "elmo-build-safety-"));
		temporaryDirectories.push(root);
		const configDir = join(root, "config");
		const sourceDir = join(root, "source");
		const stateDir = join(root, "state");
		await Promise.all([mkdir(configDir), mkdir(sourceDir), mkdir(stateDir)]);

		await expect(
			assertRecoveryStateOutsideDevelopmentBuildContexts({
				composeContents: `services:\n  web:\n    build: ${sourceDir}\n`,
				configDir,
				recoveryPath: join(stateDir, "upgrade.json"),
			}),
		).resolves.toBeUndefined();
	});

	it("rejects a recovery checkpoint inside a build context", async () => {
		const root = await mkdtemp(join(tmpdir(), "elmo-build-safety-"));
		temporaryDirectories.push(root);
		const configDir = join(root, "source", "config");
		const stateDir = join(root, "source", ".state");
		await Promise.all([mkdir(configDir, { recursive: true }), mkdir(stateDir, { recursive: true })]);

		await expect(
			assertRecoveryStateOutsideDevelopmentBuildContexts({
				composeContents: "services:\n  web:\n    build: ..\n",
				configDir,
				recoveryPath: join(stateDir, "upgrade.json"),
			}),
		).rejects.toThrow(/private recovery state would enter Docker build context/);
	});
});
