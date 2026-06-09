/**
 * Classify a cited page into a *content/source type* — the lens AEO actually
 * cares about. LLMs cite some formats far more than others (comparison/"best-of"
 * roundups, review platforms, community threads, docs…), so knowing the mix of
 * what gets cited for a brand's prompts tells you what kind of content to create
 * or get placed in. Pure + heuristic; refine the lists as needed.
 */

export type SourceType =
	| "own"
	| "competitor"
	| "comparison"
	| "review"
	| "community"
	| "wikipedia"
	| "video"
	| "social"
	| "news"
	| "docs"
	| "other";

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
	own: "Your site",
	competitor: "Competitor site",
	comparison: "Comparison / best-of",
	review: "Review platform",
	community: "Community / forum",
	wikipedia: "Wikipedia / wiki",
	video: "Video",
	social: "Social",
	news: "News / media",
	docs: "Documentation",
	other: "Other",
};

const COMMUNITY = ["reddit.com", "quora.com", "news.ycombinator.com", "ycombinator.com", "stackoverflow.com", "stackexchange.com", "superuser.com", "serverfault.com", "discourse.org"];
const REVIEW = ["g2.com", "capterra.com", "trustradius.com", "getapp.com", "softwareadvice.com", "trustpilot.com", "producthunt.com", "gartner.com", "sourceforge.net", "saashub.com"];
const WIKI = ["wikipedia.org", "wikimedia.org", "fandom.com", "wikia.com"];
const VIDEO = ["youtube.com", "youtu.be", "vimeo.com", "tiktok.com", "wistia.com"];
const SOCIAL = ["linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "threads.net", "threads.com", "pinterest.com"];
const NEWS = ["nytimes.com", "techcrunch.com", "theverge.com", "forbes.com", "businessinsider.com", "wired.com", "cnbc.com", "reuters.com", "bloomberg.com", "theguardian.com", "bbc.com", "bbc.co.uk", "venturebeat.com", "zdnet.com", "cnet.com", "wsj.com", "axios.com"];
const COMPARISON_DOMAINS = ["alternativeto.net"];

const COMPARISON_PATTERNS = ["best-", "/best", "best ", "top-", "/top-", "top ", "-vs-", " vs ", "vs.", "/vs/", "alternative", "comparison", "compare", "roundup"];

function matchesDomain(domain: string, list: string[]): boolean {
	return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export interface SourceTypeInput {
	domain: string;
	url: string;
	title?: string | null;
	isOwn?: boolean;
	isCompetitor?: boolean;
}

export function classifySourceType({ domain, url, title, isOwn, isCompetitor }: SourceTypeInput): SourceType {
	if (isOwn) return "own";
	if (isCompetitor) return "competitor";

	if (matchesDomain(domain, WIKI)) return "wikipedia";
	if (matchesDomain(domain, COMMUNITY) || /\b(forum|community)\b/.test(domain)) return "community";
	if (matchesDomain(domain, REVIEW)) return "review";
	if (matchesDomain(domain, VIDEO)) return "video";
	if (matchesDomain(domain, SOCIAL)) return "social";

	if (matchesDomain(domain, COMPARISON_DOMAINS)) return "comparison";
	const haystack = `${url} ${title ?? ""}`.toLowerCase();
	if (COMPARISON_PATTERNS.some((p) => haystack.includes(p))) return "comparison";

	const sub = domain.split(".")[0];
	if (sub === "docs" || sub === "developer" || sub === "developers" || /\/docs?\//.test(url) || /\/documentation\//.test(url)) {
		return "docs";
	}
	if (matchesDomain(domain, NEWS) || /\/news\//.test(url)) return "news";

	return "other";
}

export interface SourceTypeRow extends SourceTypeInput {
	count: number;
}

export interface SourceTypeSummary {
	type: SourceType;
	label: string;
	count: number;
	share: number; // 0..1 of total citations
	examples: string[]; // top domains for this type
}

/** Aggregate cited pages into per-type totals + share + example domains. */
export function summarizeSourceTypes(rows: SourceTypeRow[]): SourceTypeSummary[] {
	const total = rows.reduce((s, r) => s + r.count, 0);
	const byType = new Map<SourceType, { count: number; domains: Map<string, number> }>();

	for (const row of rows) {
		const type = classifySourceType(row);
		let entry = byType.get(type);
		if (!entry) {
			entry = { count: 0, domains: new Map() };
			byType.set(type, entry);
		}
		entry.count += row.count;
		entry.domains.set(row.domain, (entry.domains.get(row.domain) ?? 0) + row.count);
	}

	return [...byType.entries()]
		.map(([type, { count, domains }]) => ({
			type,
			label: SOURCE_TYPE_LABELS[type],
			count,
			share: total > 0 ? count / total : 0,
			examples: [...domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d),
		}))
		.sort((a, b) => b.count - a.count);
}
