#!/usr/bin/env node

/**
 * Fetches closed issues and releases from GitHub, groups issues by month,
 * and writes the result to src/data/changelog.json.
 *
 * Usage: node scripts/generate-changelog.mjs
 * Set GITHUB_TOKEN env var for higher rate limits.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = "elmohq/elmo";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const OUT_DIR = resolve(__dirname, "../src/data");
const OUT_FILE = resolve(OUT_DIR, "changelog.json");

const headers = {
	Accept: "application/vnd.github+json",
	"User-Agent": "elmohq-www",
};
if (process.env.GITHUB_TOKEN) {
	headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function fetchJson(url) {
	const res = await fetch(url, { headers });
	if (!res.ok) {
		throw new Error(`GitHub API ${res.status}: ${res.statusText} — ${url}`);
	}
	return res.json();
}

async function fetchAllClosedIssues() {
	const pages = await Promise.all([
		fetchJson(`${API_BASE}/issues?state=closed&sort=updated&direction=desc&per_page=100&page=1`),
		fetchJson(`${API_BASE}/issues?state=closed&sort=updated&direction=desc&per_page=100&page=2`),
	]);
	return pages.flat().filter((i) => !i.html_url.includes("/pull/"));
}

async function fetchReleases() {
	return fetchJson(`${API_BASE}/releases?per_page=50`);
}

function groupByMonth(issues) {
	const groups = new Map();

	for (const issue of issues) {
		const date = new Date(issue.closed_at ?? issue.created_at);
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push({
			number: issue.number,
			title: issue.title,
			html_url: issue.html_url,
			labels: issue.labels.map((l) => ({ name: l.name, color: l.color })),
			closed_at: issue.closed_at,
		});
	}

	return Array.from(groups.entries())
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([month, items]) => {
			const [year, m] = month.split("-");
			const date = new Date(Number(year), Number(m) - 1);
			return {
				month,
				label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
				issues: items,
			};
		});
}

function formatReleases(releases) {
	return releases
		.filter((r) => !r.draft)
		.map((r) => ({
			id: r.id,
			tag_name: r.tag_name,
			name: r.name,
			body: r.body,
			html_url: r.html_url,
			published_at: r.published_at,
			prerelease: r.prerelease,
		}));
}

async function main() {
	console.log("Fetching closed issues and releases from GitHub...");

	const [issues, rawReleases] = await Promise.all([
		fetchAllClosedIssues(),
		fetchReleases(),
	]);

	const months = groupByMonth(issues);
	const releases = formatReleases(rawReleases);

	const data = {
		generatedAt: new Date().toISOString(),
		months,
		releases,
		hasReleases: releases.length > 0,
	};

	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));

	const issueCount = months.reduce((sum, g) => sum + g.issues.length, 0);
	console.log(
		`Wrote ${OUT_FILE}\n  ${issueCount} issues across ${months.length} months, ${releases.length} releases`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
