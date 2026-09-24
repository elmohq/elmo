import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { log } from "./util.js";

export async function getPackageVersion(): Promise<string> {
	const selfDir = path.dirname(fileURLToPath(import.meta.url));
	const packagePath = path.resolve(selfDir, "..", "package.json");
	const contents = await fs.readFile(packagePath, "utf8");
	const json = JSON.parse(contents) as { version?: string };
	return json.version!;
}

export async function fetchLatestCliVersion(): Promise<string | null> {
	try {
		const response = await fetch("https://registry.npmjs.org/@elmohq/cli/latest");
		if (!response.ok) {
			return null;
		}
		const data = (await response.json()) as { version?: string };
		return data.version ?? null;
	} catch {
		return null;
	}
}

export async function maybeNotifyNewVersion(currentVersion: string): Promise<void> {
	const latest = await fetchLatestCliVersion();
	if (!latest) {
		return;
	}
	if (semver.valid(currentVersion) && semver.lt(currentVersion, latest)) {
		log.warn(`New CLI version available (${latest}). Run: npm install -g @elmohq/cli@latest`);
	}
}
