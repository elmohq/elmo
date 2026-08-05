import crypto from "node:crypto";
import fs from "node:fs/promises";
import { lock } from "proper-lockfile";
import { upgradeLockPath } from "./upgrade-storage.js";

const STALE_AFTER_MS = 5 * 60 * 1000;
const UPDATE_INTERVAL_MS = 30 * 1000;
const LIBRARY_STALE_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

export type ReleaseUpgradeLock = () => Promise<void>;

async function reclaimStaleLock(lockfilePath: string): Promise<void> {
	let metadata: Awaited<ReturnType<typeof fs.stat>>;
	try {
		metadata = await fs.stat(lockfilePath);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
		throw error;
	}
	if (metadata.mtimeMs >= Date.now() - STALE_AFTER_MS) return;

	const stalePath = `${lockfilePath}.stale-${crypto.randomUUID()}`;
	try {
		await fs.rename(lockfilePath, stalePath);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
		throw error;
	}
	await fs.rm(stalePath, { recursive: true, force: true });
}

export async function acquireUpgradeLock(configDir: string): Promise<ReleaseUpgradeLock> {
	const lockfilePath = await upgradeLockPath(configDir);
	await reclaimStaleLock(lockfilePath);
	try {
		return await lock(configDir, {
			lockfilePath,
			realpath: true,
			retries: 0,
			stale: LIBRARY_STALE_AFTER_MS,
			update: UPDATE_INTERVAL_MS,
		});
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ELOCKED") {
			throw new Error(`Another Elmo upgrade owns ${lockfilePath}; wait for it to finish before retrying`, {
				cause: error,
			});
		}
		throw error;
	}
}

export async function withUpgradeLock<T>(configDir: string, action: () => Promise<T>): Promise<T> {
	const release = await acquireUpgradeLock(configDir);
	try {
		return await action();
	} finally {
		await release();
	}
}
