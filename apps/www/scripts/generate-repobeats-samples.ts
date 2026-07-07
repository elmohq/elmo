/**
 * Renders the repo-activity SVG in every variant/theme from live GitHub data and
 * writes the results to public/brand/repobeats/ for review. Run with a token to
 * avoid rate limits and populate the Search-API KPIs:
 *
 *   GITHUB_TOKEN=$(gh auth token) pnpm --filter @workspace/www generate-repobeats
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRepobeatsData } from "../src/lib/repobeats/github";
import { renderRepobeats } from "../src/lib/repobeats/svg";
import type { RepobeatsTheme, RepobeatsVariant } from "../src/lib/repobeats/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "brand", "repobeats");

const VARIANTS: RepobeatsVariant[] = ["pulse", "dashboard", "card"];
const THEMES: RepobeatsTheme[] = ["light", "dark", "auto"];

async function main(): Promise<void> {
	console.log("Fetching live GitHub data…");
	const data = await fetchRepobeatsData({ token: process.env.GITHUB_TOKEN });
	console.log(
		`  stars=${data.stars} forks=${data.forks} contributors=${data.contributorTotal} ` +
			`commitWeeks=${data.commitsByWeek.length} churnWeeks=${data.churnByWeek.length} ` +
			`releases=${data.totals.releases} areaLabels=${data.areaLabels.length}`,
	);
	console.log(
		`  KPIs(30d): commits=${data.kpis.commits} prsMerged=${data.kpis.prsMerged} ` +
			`issuesClosed=${data.kpis.issuesClosed} releases=${data.kpis.releases}`,
	);

	await mkdir(OUT_DIR, { recursive: true });
	for (const variant of VARIANTS) {
		for (const theme of THEMES) {
			const svg = renderRepobeats(data, { variant, theme });
			const file = join(OUT_DIR, `${variant}-${theme}.svg`);
			await writeFile(file, svg);
			console.log(`  wrote ${variant}-${theme}.svg (${(svg.length / 1024).toFixed(1)} KB)`);
		}
	}

	// A redacted snapshot of the underlying data, for reference in the PR.
	const snapshot = JSON.stringify(
		data,
		(key, value) =>
			key === "avatarDataUri" && typeof value === "string"
				? `<inlined ${value.length} chars>`
				: value,
		2,
	);
	await writeFile(join(OUT_DIR, "_snapshot.json"), snapshot);
	console.log("Done.");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
