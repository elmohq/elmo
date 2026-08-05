import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireUpgradeLock, withUpgradeLock } from "./upgrade-lock.js";
import { upgradeLockPath } from "./upgrade-storage.js";

const temporaryDirectories: string[] = [];

describe("upgrade process lock", () => {
	afterEach(async () => {
		vi.unstubAllEnvs();
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("allows only one upgrade for a deployment at a time", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-lock-"));
		temporaryDirectories.push(directory);
		vi.stubEnv("XDG_STATE_HOME", join(directory, "state-a"));
		const release = await acquireUpgradeLock(directory);

		vi.stubEnv("XDG_STATE_HOME", join(directory, "state-b"));
		await expect(acquireUpgradeLock(directory)).rejects.toThrow(/Another Elmo upgrade/);
		expect(await upgradeLockPath(directory)).toBe(join(directory, ".elmo-upgrade-in-progress.lock"));

		await release();
		const releaseAgain = await acquireUpgradeLock(directory);
		await releaseAgain();
	});

	it("atomically gives one contender a stale lock", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-lock-"));
		temporaryDirectories.push(directory);
		const lockPath = await upgradeLockPath(directory);
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

	it("holds the deployment lock through a manual mutation callback", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-lock-"));
		temporaryDirectories.push(directory);
		vi.stubEnv("XDG_STATE_HOME", join(directory, "state-a"));
		let continueMutation = () => {};
		const mutationPaused = new Promise<void>((resolve) => {
			continueMutation = resolve;
		});
		let mutationStarted = () => {};
		const started = new Promise<void>((resolve) => {
			mutationStarted = resolve;
		});
		const mutation = withUpgradeLock(directory, async () => {
			mutationStarted();
			await mutationPaused;
		});
		await started;

		vi.stubEnv("XDG_STATE_HOME", join(directory, "state-b"));
		await expect(acquireUpgradeLock(directory)).rejects.toThrow(/Another Elmo upgrade/);
		continueMutation();
		await mutation;

		const release = await acquireUpgradeLock(directory);
		await release();
	});
});
