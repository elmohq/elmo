/**
 * Renders the repo-activity SVG from GitHub data and writes it to
 * public/brand/repo-activity/repo-activity.svg.
 *
 *   GITHUB_TOKEN=$(gh auth token) pnpm --filter @workspace/www generate-repo-activity
 *
 * For fast design iteration (no network per render), the first live fetch also
 * caches the raw data to .context/repo-activity-data.json; set REPO_ACTIVITY_DATA_FILE
 * to that path to re-render instantly from the cached snapshot:
 *
 *   REPO_ACTIVITY_DATA_FILE=../../.context/repo-activity-data.json pnpm --filter @workspace/www generate-repo-activity
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRepoActivityData } from "../src/lib/repo-activity/github";
import { renderRepoActivity } from "../src/lib/repo-activity/svg";
import type { RepoActivityData } from "../src/lib/repo-activity/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "brand", "repo-activity");
const OUT_FILE = join(OUT_DIR, "repo-activity.svg");
const CACHE_FILE =
	process.env.REPO_ACTIVITY_DATA_FILE ?? join(HERE, "..", "..", "..", ".context", "repo-activity-data.json");

async function loadData(): Promise<RepoActivityData> {
	if (process.env.REPO_ACTIVITY_DATA_FILE && existsSync(process.env.REPO_ACTIVITY_DATA_FILE)) {
		console.log(`Using cached data from ${process.env.REPO_ACTIVITY_DATA_FILE}`);
		return JSON.parse(await readFile(process.env.REPO_ACTIVITY_DATA_FILE, "utf8")) as RepoActivityData;
	}
	console.log("Fetching live GitHub data…");
	const data = await fetchRepoActivityData({ token: process.env.GITHUB_TOKEN });
	await mkdir(dirname(CACHE_FILE), { recursive: true }).catch(() => {});
	await writeFile(CACHE_FILE, JSON.stringify(data)).catch(() => {});
	return data;
}

async function main(): Promise<void> {
	const data = await loadData();
	console.log(
		`  contributors=${data.contributorTotal} commitWeeks=${data.commitsByWeek.length} ` +
			`releases=${data.totals.releases} areaLabels=${data.areaLabels.length}`,
	);
	console.log(
		`  KPIs(30d): commits=${data.kpis.commits} prsMerged=${data.kpis.prsMerged} ` +
			`issuesClosed=${data.kpis.issuesClosed} contributors=${data.kpis.contributors}`,
	);
	await mkdir(OUT_DIR, { recursive: true });
	const svg = renderRepoActivity(data);
	await writeFile(OUT_FILE, svg);
	console.log(`Wrote ${OUT_FILE} (${(svg.length / 1024).toFixed(1)} KB)`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
