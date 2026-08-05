import path from "node:path";
import { lock } from "proper-lockfile";

const LOCK_FILE = ".elmo-upgrade.lock";
const STALE_AFTER_MS = 5 * 60 * 1000;
const UPDATE_INTERVAL_MS = 30 * 1000;

export type ReleaseUpgradeLock = () => Promise<void>;

export async function acquireUpgradeLock(configDir: string): Promise<ReleaseUpgradeLock> {
	const lockfilePath = path.join(configDir, LOCK_FILE);
	try {
		return await lock(configDir, {
			lockfilePath,
			realpath: true,
			retries: 0,
			stale: STALE_AFTER_MS,
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
