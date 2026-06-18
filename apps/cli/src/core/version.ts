import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { log } from "./ui.js";

export async function getPackageVersion(): Promise<string> {
	const selfDir = path.dirname(fileURLToPath(import.meta.url));
	// dist/index.js sits one level under the package root; src/core/version.ts
	// sits two. Walk up until we find the package.json with a version.
	for (const rel of ["..", "../..", "../../.."]) {
		try {
			const contents = await fs.readFile(path.resolve(selfDir, rel, "package.json"), "utf8");
			const json = JSON.parse(contents) as { name?: string; version?: string };
			if (json.version && json.name === "@elmohq/cli") return json.version;
		} catch {
			// keep walking
		}
	}
	return "0.0.0";
}

async function maybeNotifyNewVersion(currentVersion: string): Promise<void> {
	try {
		const response = await fetch("https://registry.npmjs.org/@elmohq/cli/latest");
		if (!response.ok) return;
		const data = (await response.json()) as { version?: string };
		if (!data.version) return;
		if (semver.valid(currentVersion) && semver.lt(currentVersion, data.version)) {
			log.warn(`New CLI version available (${data.version}). Run: npm install -g @elmohq/cli@latest`);
		}
	} catch {
		// Ignore update errors
	}
}

/** Run `fn`, then surface a new-version notice once it settles. */
export async function withVersionCheck(version: string, fn: () => Promise<void>): Promise<void> {
	const notifyPromise = maybeNotifyNewVersion(version);
	await fn();
	await notifyPromise.catch(() => undefined);
}
