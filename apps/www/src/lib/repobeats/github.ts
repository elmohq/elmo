/**
 * Pure GitHub data layer for the repo-activity SVG. No Redis / TanStack imports
 * so the sample generator (`scripts/generate-repobeats-samples.ts`) can call it
 * directly. Caching lives in `cache.ts`.
 *
 * A `GITHUB_TOKEN` is optional but recommended (same convention as
 * `github-roadmap.ts` / `github-changelog.ts`): it lifts the REST rate limit to
 * 5000/h and enables the Search API used for the PR/issue KPIs and the accurate
 * open/closed issue totals. Everything degrades gracefully without it.
 */

import {
	AREA_LABEL_NAMES,
	AREA_LABEL_ORDER,
	CHART_COLORS,
	HISTORY_WEEKS,
	MAX_CONTRIB_AVATARS,
	REPO,
	WINDOW_DAYS,
	isBot,
} from "./constants";
import type {
	ChurnPoint,
	LabelSlice,
	RepoContributor,
	RepobeatsData,
	ReleaseInfo,
	WeekPoint,
} from "./types";

const API = `https://api.github.com/repos/${REPO}`;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

function ghHeaders(token: string | undefined): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"User-Agent": "elmo-www",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ghJson<T>(url: string, token: string | undefined): Promise<T> {
	const res = await fetch(url, { headers: ghHeaders(token) });
	if (!res.ok) throw new Error(`GitHub ${res.status}: ${url}`);
	return (await res.json()) as T;
}

/**
 * The `/stats/*` endpoints answer 202 (empty body) while GitHub recomputes them,
 * and occasionally 200 with an empty array. Retry a few times with backoff.
 */
async function ghStats<T>(
	path: string,
	token: string | undefined,
	tries = 4,
): Promise<T | null> {
	for (let attempt = 0; attempt < tries; attempt++) {
		try {
			const res = await fetch(`${API}${path}`, { headers: ghHeaders(token) });
			if (res.status === 202) {
				await delay(1200 * (attempt + 1));
				continue;
			}
			if (!res.ok) return null;
			const text = await res.text();
			if (!text) {
				await delay(1000 * (attempt + 1));
				continue;
			}
			const parsed = JSON.parse(text) as T;
			if (Array.isArray(parsed) && parsed.length === 0) {
				await delay(1000 * (attempt + 1));
				continue;
			}
			return parsed;
		} catch {
			return null;
		}
	}
	return null;
}

/** Search API count; null when unavailable (no token / rate-limited / error). */
async function searchCount(
	query: string,
	token: string | undefined,
): Promise<number | null> {
	try {
		const res = await fetch(
			`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
			{ headers: ghHeaders(token) },
		);
		if (!res.ok) return null;
		const json = (await res.json()) as { total_count?: number };
		return typeof json.total_count === "number" ? json.total_count : null;
	} catch {
		return null;
	}
}

function toBase64(bytes: Uint8Array): string {
	if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	// btoa exists in Nitro/edge runtimes as a fallback for the (rare) no-Buffer case.
	return btoa(binary);
}

/** Fetch an avatar and inline it as a small `data:` URI (null on any failure). */
async function fetchAvatar(url: string): Promise<string | null> {
	try {
		const sized = `${url}${url.includes("?") ? "&" : "?"}s=48`;
		const res = await fetch(sized, { headers: { "User-Agent": "elmo-www" } });
		if (!res.ok) return null;
		const contentType = res.headers.get("content-type") ?? "image/png";
		const bytes = new Uint8Array(await res.arrayBuffer());
		if (bytes.length === 0 || bytes.length > 64 * 1024) return null;
		return `data:${contentType};base64,${toBase64(bytes)}`;
	} catch {
		return null;
	}
}

interface RepoCore {
	stargazers_count?: number;
	forks_count?: number;
	open_issues_count?: number;
	description?: string | null;
	created_at?: string;
	pushed_at?: string;
}
interface RawContributor {
	login: string;
	html_url: string;
	avatar_url: string;
	contributions: number;
	type?: string;
}
interface RawRelease {
	tag_name: string;
	published_at: string | null;
	prerelease: boolean;
	draft: boolean;
}

function areaFriendly(key: string): string {
	if (AREA_LABEL_NAMES[key]) return AREA_LABEL_NAMES[key];
	const bare = key.replace(/^area\//, "").replace(/[-_]/g, " ");
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/**
 * Every `area/*` label's issue count, via the Search API's exact `total_count`
 * (no pagination, so it never undercounts). Labels are discovered from the repo
 * so newly-added areas show up automatically. Works with or without a token,
 * though a token lifts the search rate limit.
 */
async function fetchAreaLabels(token: string | undefined): Promise<LabelSlice[]> {
	const discovered = await ghJson<Array<{ name: string }>>(`${API}/labels?per_page=100`, token)
		.then((labels) => labels.map((l) => l.name).filter((n) => n.startsWith("area/")))
		.catch(() => [] as string[]);
	const names = discovered.length > 0 ? discovered : AREA_LABEL_ORDER;

	// Canonical labels first (stable colours — Core stays brand blue), then any extras.
	const ordered = [
		...AREA_LABEL_ORDER.filter((k) => names.includes(k)),
		...names.filter((n) => !AREA_LABEL_ORDER.includes(n)).sort(),
	];

	const slices = await Promise.all(
		ordered.map(async (key, i) => ({
			key,
			label: areaFriendly(key),
			count: (await searchCount(`repo:${REPO} is:issue label:"${key}"`, token)) ?? 0,
			color: CHART_COLORS[i % CHART_COLORS.length],
		})),
	);
	return slices.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
}

export async function fetchRepobeatsData(
	opts: { token?: string } = {},
): Promise<RepobeatsData> {
	const token = opts.token ?? process.env.GITHUB_TOKEN;
	const now = new Date();
	const sinceIso = new Date(now.getTime() - WINDOW_DAYS * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const windowStartSec = Math.floor(
		(now.getTime() - WINDOW_DAYS * 86_400_000) / 1000,
	);
	const q = (rest: string) => `repo:${REPO} ${rest}`;

	const [
		repo,
		commitActivity,
		contributorsRaw,
		releasesRaw,
		areaLabels,
		prsMerged,
		prsOpened,
		issuesClosed,
		issuesOpened,
		issuesOpenTotal,
		issuesClosedTotal,
	] = await Promise.all([
		ghJson<RepoCore>(API, token).catch(() => null),
		ghStats<Array<{ week: number; total: number }>>("/stats/commit_activity", token),
		ghJson<RawContributor[]>(`${API}/contributors?per_page=100&anon=false`, token).catch(
			() => [] as RawContributor[],
		),
		ghJson<RawRelease[]>(`${API}/releases?per_page=100`, token).catch(
			() => [] as RawRelease[],
		),
		fetchAreaLabels(token),
		searchCount(q(`is:pr is:merged merged:>=${sinceIso}`), token),
		searchCount(q(`is:pr created:>=${sinceIso}`), token),
		searchCount(q(`is:issue is:closed closed:>=${sinceIso}`), token),
		searchCount(q(`is:issue created:>=${sinceIso}`), token),
		searchCount(q("is:issue is:open"), token),
		searchCount(q("is:issue is:closed"), token),
	]);

	const commitsByWeek: WeekPoint[] = (commitActivity ?? [])
		.map((w) => ({ week: w.week, total: w.total }))
		.slice(-HISTORY_WEEKS);

	// Line-of-code churn (`/stats/code_frequency`) is intentionally not fetched:
	// it is slow to compute (frequent 202s) and no current variant renders it.
	const churnByWeek: ChurnPoint[] = [];

	const releases = releasesRaw.filter((r) => !r.draft && r.published_at);
	const latest = releases[0];
	const latestRelease: ReleaseInfo | null = latest
		? { tag: latest.tag_name, date: latest.published_at as string, prerelease: latest.prerelease }
		: null;

	// Map each release onto the commit-chart week bucket it falls in, for markers.
	const weekStarts = commitsByWeek.map((p) => p.week);
	const releaseWeekSet = new Set<number>();
	for (const release of releases) {
		const ts = Math.floor(Date.parse(release.published_at as string) / 1000);
		for (let i = weekStarts.length - 1; i >= 0; i--) {
			if (ts >= weekStarts[i]) {
				if (ts < weekStarts[i] + WEEK_SECONDS) releaseWeekSet.add(weekStarts[i]);
				break;
			}
		}
	}

	const humans = contributorsRaw
		.filter((c) => !isBot(c.login, c.type))
		.sort((a, b) => b.contributions - a.contributions);
	const top = humans.slice(0, MAX_CONTRIB_AVATARS);
	const avatarUris = await Promise.all(top.map((c) => fetchAvatar(c.avatar_url)));
	const contributors: RepoContributor[] = top.map((c, i) => ({
		login: c.login,
		htmlUrl: c.html_url,
		contributions: c.contributions,
		avatarDataUri: avatarUris[i],
	}));

	const commitsInWindow = commitsByWeek
		.filter((p) => p.week >= windowStartSec)
		.reduce((sum, p) => sum + p.total, 0);
	const releasesInWindow = releases.filter(
		(r) => Date.parse(r.published_at as string) >= now.getTime() - WINDOW_DAYS * 86_400_000,
	).length;

	return {
		repo: REPO,
		generatedAt: now.toISOString(),
		windowDays: WINDOW_DAYS,
		stars: repo?.stargazers_count ?? 0,
		forks: repo?.forks_count ?? 0,
		description: repo?.description ?? null,
		createdAt: repo?.created_at ?? "",
		pushedAt: repo?.pushed_at ?? "",
		commitsByWeek,
		churnByWeek,
		releaseWeeks: [...releaseWeekSet],
		kpis: {
			commits: commitsInWindow,
			prsMerged: prsMerged ?? 0,
			prsOpened: prsOpened ?? 0,
			issuesClosed: issuesClosed ?? 0,
			issuesOpened: issuesOpened ?? 0,
			releases: releasesInWindow,
			contributors: humans.length,
		},
		totals: {
			issuesOpen: issuesOpenTotal ?? 0,
			issuesClosed: issuesClosedTotal ?? 0,
			releases: releases.length,
		},
		latestRelease,
		contributors,
		contributorTotal: humans.length,
		areaLabels,
	};
}
