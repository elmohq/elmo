const REPO = "elmohq/elmo";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface GitHubLabel {
	name: string;
	color: string;
}

export interface GitHubMilestone {
	number: number;
	title: string;
	due_on: string | null;
	html_url: string;
}

export interface GitHubIssue {
	number: number;
	title: string;
	html_url: string;
	state: "open" | "closed";
	labels: GitHubLabel[];
	milestone: GitHubMilestone | null;
	created_at: string;
	closed_at: string | null;
	body: string | null;
}

export interface GitHubRelease {
	id: number;
	tag_name: string;
	name: string;
	body: string;
	html_url: string;
	published_at: string;
	prerelease: boolean;
}

interface CacheEntry<T> {
	data: T;
	fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(url: string): Promise<T> {
	const entry = cache.get(url) as CacheEntry<T> | undefined;
	if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
		return entry.data;
	}

	const res = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "elmohq-www",
		},
	});

	if (!res.ok) {
		throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
	}

	const data = (await res.json()) as T;
	cache.set(url, { data, fetchedAt: Date.now() });
	return data;
}

export async function fetchClosedIssues(): Promise<GitHubIssue[]> {
	const pages = await Promise.all([
		cachedFetch<GitHubIssue[]>(
			`${API_BASE}/issues?state=closed&sort=updated&direction=desc&per_page=100&page=1`,
		),
		cachedFetch<GitHubIssue[]>(
			`${API_BASE}/issues?state=closed&sort=updated&direction=desc&per_page=100&page=2`,
		),
	]);
	return pages
		.flat()
		.filter((i) => !i.html_url.includes("/pull/"));
}

export async function fetchOpenIssues(): Promise<GitHubIssue[]> {
	const pages = await Promise.all([
		cachedFetch<GitHubIssue[]>(
			`${API_BASE}/issues?state=open&sort=created&direction=desc&per_page=100&page=1`,
		),
		cachedFetch<GitHubIssue[]>(
			`${API_BASE}/issues?state=open&sort=created&direction=desc&per_page=100&page=2`,
		),
	]);
	return pages
		.flat()
		.filter((i) => !i.html_url.includes("/pull/"));
}

export async function fetchReleases(): Promise<GitHubRelease[]> {
	return cachedFetch<GitHubRelease[]>(
		`${API_BASE}/releases?per_page=50`,
	);
}

export function groupIssuesByMonth(
	issues: GitHubIssue[],
): { month: string; label: string; issues: GitHubIssue[] }[] {
	const groups = new Map<string, GitHubIssue[]>();

	for (const issue of issues) {
		const date = new Date(issue.closed_at ?? issue.created_at);
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

		const existing = groups.get(key);
		if (existing) {
			existing.push(issue);
		} else {
			groups.set(key, [issue]);
		}
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

export interface MilestoneGroup {
	key: string;
	label: string;
	dueOn: string | null;
	milestoneUrl: string | null;
	issues: GitHubIssue[];
}

export function groupIssuesByMilestone(issues: GitHubIssue[]): MilestoneGroup[] {
	const groups = new Map<string, { milestone: GitHubMilestone | null; issues: GitHubIssue[] }>();

	for (const issue of issues) {
		const key = issue.milestone?.title ?? "__uncategorized__";
		const existing = groups.get(key);
		if (existing) {
			existing.issues.push(issue);
		} else {
			groups.set(key, { milestone: issue.milestone, issues: [issue] });
		}
	}

	return Array.from(groups.entries())
		.sort(([keyA, a], [keyB, b]) => {
			if (keyA === "__uncategorized__") return 1;
			if (keyB === "__uncategorized__") return -1;
			const dateA = a.milestone?.due_on ?? "";
			const dateB = b.milestone?.due_on ?? "";
			if (dateA && dateB) return dateA.localeCompare(dateB);
			if (dateA) return -1;
			if (dateB) return 1;
			return keyA.localeCompare(keyB);
		})
		.map(([key, { milestone, issues: items }]) => ({
			key,
			label: key === "__uncategorized__" ? "Uncategorized" : milestone?.title ?? key,
			dueOn: milestone?.due_on ?? null,
			milestoneUrl: milestone?.html_url ?? null,
			issues: items,
		}));
}

export const AREA_LABELS: Record<string, { label: string; description: string }> = {
	"area/core": {
		label: "Core Platform",
		description: "Core visibility tracking, dashboards, and analytics",
	},
	"area/oss": {
		label: "Open Source",
		description: "Developer experience and community tooling",
	},
	"area/extensions": {
		label: "Extensions",
		description: "Integrations, plugins, and extended functionality",
	},
	"area/admin": {
		label: "Admin",
		description: "Administration panel and multi-tenant management",
	},
	"area/whitelabel": {
		label: "White Label",
		description: "White-label deployment and branding customization",
	},
	"area/cloud": {
		label: "Cloud",
		description: "Managed cloud hosting and infrastructure",
	},
};

export function groupIssuesByArea(
	issues: GitHubIssue[],
): { area: string; label: string; description: string; issues: GitHubIssue[] }[] {
	const groups = new Map<string, GitHubIssue[]>();

	for (const issue of issues) {
		const areaLabel = issue.labels.find((l) => l.name.startsWith("area/"));
		const key = areaLabel?.name ?? "other";
		const existing = groups.get(key);
		if (existing) {
			existing.push(issue);
		} else {
			groups.set(key, [issue]);
		}
	}

	const order = Object.keys(AREA_LABELS);
	return Array.from(groups.entries())
		.sort(([a], [b]) => {
			const ai = order.indexOf(a);
			const bi = order.indexOf(b);
			return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
		})
		.map(([area, items]) => {
			const meta = AREA_LABELS[area] ?? {
				label: "Other",
				description: "Uncategorized items",
			};
			return { area, ...meta, issues: items };
		});
}
