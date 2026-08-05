import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertDevelopmentSourceVersion } from "./development-source-version.js";

const temporaryDirectories: string[] = [];

async function sourceCheckout(version: string): Promise<{ configDir: string; sourceDir: string }> {
	const root = await mkdtemp(join(tmpdir(), "elmo-source-version-"));
	temporaryDirectories.push(root);
	const configDir = join(root, "config");
	const sourceDir = join(root, "source");
	await mkdir(configDir);
	for (const manifest of [
		{ relativePath: "apps/cli/package.json", name: "@elmohq/cli" },
		{ relativePath: "apps/web/package.json", name: "@workspace/web" },
		{ relativePath: "apps/worker/package.json", name: "@workspace/worker" },
		{ relativePath: "packages/lib/package.json", name: "@workspace/lib" },
	]) {
		const manifestPath = join(sourceDir, manifest.relativePath);
		await mkdir(join(manifestPath, ".."), { recursive: true });
		await writeFile(manifestPath, JSON.stringify({ name: manifest.name, version }), "utf8");
	}
	await mkdir(join(sourceDir, "docker"), { recursive: true });
	await writeFile(join(sourceDir, "docker", "Dockerfile"), "FROM scratch\n", "utf8");
	return { configDir, sourceDir };
}

function compose(sourceDir: string): string {
	return `services:\n  web:\n    build:\n      context: ${sourceDir}\n      dockerfile: docker/Dockerfile\n      target: web\n  worker:\n    build:\n      context: ${sourceDir}\n      dockerfile: docker/Dockerfile\n      target: worker\n`;
}

describe("development release provenance", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("accepts a checkout declaring the exact target release", async () => {
		const checkout = await sourceCheckout("1.2.3");
		await expect(
			assertDevelopmentSourceVersion({
				composeContents: compose(checkout.sourceDir),
				configDir: checkout.configDir,
				targetVersion: "1.2.3",
			}),
		).resolves.toBeUndefined();
	});

	it("rejects old or future source before database migration", async () => {
		const checkout = await sourceCheckout("1.2.2");
		await expect(
			assertDevelopmentSourceVersion({
				composeContents: compose(checkout.sourceDir),
				configDir: checkout.configDir,
				targetVersion: "1.2.3",
			}),
		).rejects.toThrow(/does not declare Elmo release 1.2.3/);
	});

	it("rejects uninspectable remote build contexts", async () => {
		const checkout = await sourceCheckout("1.2.3");
		await expect(
			assertDevelopmentSourceVersion({
				composeContents:
					"services:\n  web:\n    build: https://example.com/elmo.git\n  worker:\n    build: https://example.com/elmo.git\n",
				configDir: checkout.configDir,
				targetVersion: "1.2.3",
			}),
		).rejects.toThrow(/Cannot prove target release provenance/);
	});

	it("rejects an arbitrary Dockerfile stage despite matching manifests", async () => {
		const checkout = await sourceCheckout("1.2.3");
		await expect(
			assertDevelopmentSourceVersion({
				composeContents: compose(checkout.sourceDir).replace("target: worker", "target: migrate"),
				configDir: checkout.configDir,
				targetVersion: "1.2.3",
			}),
		).rejects.toThrow(/must build target worker/);
	});
});
