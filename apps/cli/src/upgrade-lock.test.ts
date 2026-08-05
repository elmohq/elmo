import { mkdir, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireUpgradeLock } from "./upgrade-lock.js";

const temporaryDirectories: string[] = [];

describe("upgrade process lock", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("allows only one upgrade for a deployment at a time", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-lock-"));
		temporaryDirectories.push(directory);
		const release = await acquireUpgradeLock(directory);

		await expect(acquireUpgradeLock(directory)).rejects.toThrow(/Another Elmo upgrade/);
		expect((await stat(join(directory, ".elmo-upgrade.lock"))).isDirectory()).toBe(true);

		await release();
		const releaseAgain = await acquireUpgradeLock(directory);
		await releaseAgain();
	});

	it("atomically gives one contender a stale lock", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-lock-"));
		temporaryDirectories.push(directory);
		const lockPath = join(directory, ".elmo-upgrade.lock");
		await mkdir(lockPath);
		const staleTime = new Date(Date.now() - 10 * 60 * 1000);
		await utimes(lockPath, staleTime, staleTime);

		const contenders = await Promise.allSettled([acquireUpgradeLock(directory), acquireUpgradeLock(directory)]);
		const acquired = contenders.filter(
			(result): result is PromiseFulfilledResult<() => Promise<void>> => result.status === "fulfilled",
		);
		expect(acquired).toHaveLength(1);
		expect(contenders.filter((result) => result.status === "rejected")).toHaveLength(1);
		await acquired[0]?.value();
	});
});
