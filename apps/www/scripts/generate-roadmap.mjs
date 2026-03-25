#!/usr/bin/env node

/**
 * Fetches open issues from GitHub, groups by area label,
 * sorts by engagement (reactions + comments), and writes
 * the result to src/data/roadmap.json.
 *
 * Usage: node scripts/generate-roadmap.mjs
 * Set GITHUB_TOKEN env var for higher rate limits.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = "elmohq/elmo";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const OUT_DIR = resolve(__dirname, "../src/data");
const OUT_FILE = resolve(OUT_DIR, "roadmap.json");

const AREA_ORDER = [
	"area/core",
	"area/oss",
	"area/extensions",
	"area/admin",
	"area/whitelabel",
	"area/cloud",
];

const AREA_META = {
	"area/core": { label: "Core Platform", description: "Core visibility tracking, dashboards, and analytics" },
	"area/oss": { label: "Open Source", description: "Developer experience and community tooling" },
	"area/extensions": { label: "Extensions", description: "Integrations, plugins, and extended functionality" },
	"area/admin": { label: "Admin", description: "Administration panel and multi-tenant management" },
	"area/whitelabel": { label: "White Label", description: "White-label deployment and branding customization" },
	"area/cloud": { label: "Cloud", description: "Managed cloud hosting and infrastructure" },
};

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

async function fetchAllOpenIssues() {
	const pages = await Promise.all([
		fetchJson(`${API_BASE}/issues?state=open&sort=created&direction=desc&per_page=100&page=1`),
		fetchJson(`${API_BASE}/issues?state=open&sort=created&direction=desc&per_page=100&page=2`),
	]);
	return pages.flat().filter((i) => !i.html_url.includes("/pull/"));
}

function getEngagement(issue) {
	const reactions = issue.reactions?.total_count ?? 0;
	const comments = issue.comments ?? 0;
	return reactions + comments;
}

function groupByArea(issues) {
	const groups = new Map();

	for (const issue of issues) {
		const areaLabel = issue.labels.find((l) => l.name.startsWith("area/"));
		const key = areaLabel?.name ?? "other";
		if (!groups.has(key)) groups.set(key, []);

		const engagement = getEngagement(issue);
		groups.get(key).push({
			number: issue.number,
			title: issue.title,
			html_url: issue.html_url,
			labels: issue.labels.map((l) => ({ name: l.name, color: l.color })),
			milestone: issue.milestone
				? { title: issue.milestone.title, due_on: issue.milestone.due_on }
				: null,
			created_at: issue.created_at,
			reactions: issue.reactions?.total_count ?? 0,
			comments: issue.comments ?? 0,
			engagement,
		});
	}

	for (const items of groups.values()) {
		items.sort((a, b) => b.engagement - a.engagement);
	}

	return Array.from(groups.entries())
		.sort(([a], [b]) => {
			const ai = AREA_ORDER.indexOf(a);
			const bi = AREA_ORDER.indexOf(b);
			return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
		})
		.map(([area, items]) => {
			const meta = AREA_META[area] ?? { label: "Other", description: "Uncategorized items" };
			return { area, ...meta, issues: items };
		});
}

async function main() {
	console.log("Fetching open issues from GitHub...");

	const issues = await fetchAllOpenIssues();
	const groups = groupByArea(issues);

	const data = {
		generatedAt: new Date().toISOString(),
		groups,
		totalCount: issues.length,
	};

	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));

	console.log(
		`Wrote ${OUT_FILE}\n  ${issues.length} issues across ${groups.length} area groups`,
	);
	for (const g of groups) {
		console.log(`  ${g.label}: ${g.issues.length} issues`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
