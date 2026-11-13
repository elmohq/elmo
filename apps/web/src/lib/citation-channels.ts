/**
 * Which channels the brand and its competitors show up in among cited sources.
 *
 * A citation on a company's own domain is its "Own Website" channel. Anywhere
 * else, a page counts for a company when its title or URL names it — a video
 * about it, its channel handle, a review of it — which is the closest signal
 * citation data carries for where a company puts its effort.
 */
import { inDomainSet } from "@workspace/lib/citations/domain-categories";
import type { StaticCategory } from "@workspace/lib/citations/page-classification";
import { normalizeDomain, wholeWordPattern } from "@workspace/lib/mentions";

export const BRAND_SUBJECT_ID = "brand";
const OWNED_CHANNEL = "owned";
const MAX_COMPETITORS = 4;
const MAX_CHANNELS = 10;
const MAX_PAGES_PER_CHANNEL = 8;

const PLATFORM_CHANNELS: { key: string; label: string; domains: string[] }[] = [
	{ key: "youtube", label: "YouTube", domains: ["youtube.com", "youtu.be"] },
	{ key: "reddit", label: "Reddit", domains: ["reddit.com"] },
	{ key: "linkedin", label: "LinkedIn", domains: ["linkedin.com"] },
	{ key: "x", label: "X", domains: ["x.com", "twitter.com"] },
	{ key: "tiktok", label: "TikTok", domains: ["tiktok.com"] },
	{ key: "instagram", label: "Instagram", domains: ["instagram.com"] },
	{ key: "facebook", label: "Facebook", domains: ["facebook.com"] },
	{ key: "pinterest", label: "Pinterest", domains: ["pinterest.com"] },
	{ key: "quora", label: "Quora", domains: ["quora.com"] },
	{ key: "medium", label: "Medium", domains: ["medium.com"] },
	{ key: "substack", label: "Substack", domains: ["substack.com"] },
	{ key: "github", label: "GitHub", domains: ["github.com", "github.io"] },
	{ key: "wikipedia", label: "Wikipedia", domains: ["wikipedia.org"] },
];

const PLATFORM_BY_DOMAIN = new Map(
	PLATFORM_CHANNELS.flatMap((channel) => channel.domains.map((domain) => [domain, channel.key] as const)),
);
const PLATFORM_DOMAINS = new Set(PLATFORM_BY_DOMAIN.keys());

const CATEGORY_CHANNEL_LABELS: Record<string, string> = {
	reviews: "Review Sites",
	editorial: "Editorial",
	pr: "PR Wires",
	ecommerce: "Marketplaces & Retail",
	social: "Forums & Communities",
	developer: "Developer Sites",
	reference: "Reference",
	institutional: "Institutional",
	other: "Other Websites",
};

const CHANNEL_LABELS: Record<string, string> = {
	[OWNED_CHANNEL]: "Own Website",
	...Object.fromEntries(PLATFORM_CHANNELS.map((channel) => [channel.key, channel.label])),
	...CATEGORY_CHANNEL_LABELS,
};

function platformFor(domain: string): string | undefined {
	if (!inDomainSet(domain, PLATFORM_DOMAINS)) return undefined;
	let d = domain;
	while (true) {
		const key = PLATFORM_BY_DOMAIN.get(d);
		if (key) return key;
		d = d.slice(d.indexOf(".") + 1);
	}
}

const channelFor = (domain: string, staticCategory: StaticCategory): string =>
	platformFor(domain) ?? (staticCategory in CATEGORY_CHANNEL_LABELS ? staticCategory : "other");

export interface ChannelSubjectInput {
	id: string;
	name: string;
	aliases: string[];
	domains: string[];
}

export interface ChannelDomainRow {
	domain: string;
	static_category: StaticCategory;
	count: number;
}

export interface ChannelPageRow extends ChannelDomainRow {
	url: string;
	title: string | null;
}

export interface ChannelMix {
	totalCitations: number;
	subjects: { id: string; name: string; kind: "brand" | "competitor"; domain?: string }[];
	channels: {
		key: string;
		label: string;
		citations: number;
		bySubject: Record<string, { citations: number; pages: number }>;
		topPages: { url: string; title?: string; count: number; subjectIds: string[] }[];
	}[];
}

const namesOf = (subject: ChannelSubjectInput): string[] => [
	...new Set([subject.name, ...subject.aliases].map((term) => term.trim().toLowerCase()).filter((t) => t.length > 1)),
];

const compact = (term: string) => term.replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Substrings any page naming one of these subjects must contain, for narrowing
 * the pages read before the exact match below. Each is the longest unbroken run
 * of a name, which survives however a URL slug or handle separates its words.
 */
export function channelSearchTerms(subjects: ChannelSubjectInput[]): string[] {
	const runs = subjects.flatMap(namesOf).flatMap((term) => {
		const longest = (term.match(/[\p{L}\p{N}]+/gu) ?? []).sort((a, b) => b.length - a.length)[0];
		return longest && longest.length > 1 ? [longest] : [];
	});
	return [...new Set(runs)];
}

function subjectMatcher(subject: ChannelSubjectInput) {
	const names = namesOf(subject);
	const inTitle = names.map(wholeWordPattern);
	// Handles and slugs drop the spaces ("@acmecorp"), so a URL may also carry the name run together.
	const inUrl = [...new Set([...names, ...names.map(compact).filter((term) => term.length > 3)])].map(wholeWordPattern);
	const domains = new Set(subject.domains.map(normalizeDomain).filter(Boolean));
	return {
		owns: (domain: string) => inDomainSet(domain, domains),
		names: (title: string, urlWords: string) =>
			inTitle.some((pattern) => title.search(pattern) !== -1) ||
			inUrl.some((pattern) => urlWords.search(pattern) !== -1),
	};
}

function urlWords(url: string): string {
	let text = url.replace(/^https?:\/\/(www\.)?/, "");
	try {
		text = decodeURIComponent(text);
	} catch {
		// A malformed escape leaves the URL as written.
	}
	return text.toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, " ");
}

type Channel = ChannelMix["channels"][number];

function channelTally() {
	const channels = new Map<string, Channel>();
	return {
		channels,
		channel(key: string): Channel {
			let entry = channels.get(key);
			if (!entry) {
				entry = { key, label: CHANNEL_LABELS[key], citations: 0, bySubject: {}, topPages: [] };
				channels.set(key, entry);
			}
			return entry;
		},
		credit(entry: Channel, subjectId: string, citations: number, pages: number) {
			const cell = entry.bySubject[subjectId] ?? { citations: 0, pages: 0 };
			cell.citations += citations;
			cell.pages += pages;
			entry.bySubject[subjectId] = cell;
		},
	};
}

/**
 * `domains` covers every cited page in the window; `pages` only needs those that
 * could belong to or name a subject (see `channelSearchTerms`).
 */
export function buildChannelMix(args: {
	domains: ChannelDomainRow[];
	pages: ChannelPageRow[];
	brand: Omit<ChannelSubjectInput, "id">;
	competitors: ChannelSubjectInput[];
}): ChannelMix {
	const subjects = [{ ...args.brand, id: BRAND_SUBJECT_ID }, ...args.competitors].map((subject) => ({
		id: subject.id,
		name: subject.name,
		domain: subject.domains.map(normalizeDomain).find(Boolean),
		matcher: subjectMatcher(subject),
	}));
	const ownerOf = (domain: string) => subjects.find((subject) => subject.matcher.owns(domain))?.id;
	const channelOf = (row: ChannelDomainRow, owner: string | undefined) =>
		tally.channel(owner ? OWNED_CHANNEL : channelFor(row.domain, row.static_category));
	const subjectsOf = (page: ChannelPageRow, owner: string | undefined): string[] => {
		if (owner) return [owner];
		const title = (page.title ?? "").toLowerCase();
		const words = urlWords(page.url);
		return subjects.filter((subject) => subject.matcher.names(title, words)).map((subject) => subject.id);
	};

	const tally = channelTally();
	let totalCitations = 0;
	for (const row of args.domains) {
		const count = Number(row.count);
		totalCitations += count;
		const owner = ownerOf(row.domain);
		const entry = channelOf(row, owner);
		entry.citations += count;
		if (owner) tally.credit(entry, owner, count, 0);
	}

	for (const page of args.pages) {
		const owner = ownerOf(page.domain);
		const subjectIds = subjectsOf(page, owner);
		if (subjectIds.length === 0) continue;
		const entry = channelOf(page, owner);
		const count = Number(page.count);
		// An owned page's citations are already in its domain's total.
		for (const subjectId of subjectIds) tally.credit(entry, subjectId, owner ? 0 : count, 1);
		entry.topPages.push({ url: page.url, title: page.title ?? undefined, count, subjectIds });
	}

	return shapeChannelMix(subjects, [...tally.channels.values()], totalCitations);
}

function shapeChannelMix(
	subjects: { id: string; name: string; domain?: string }[],
	channels: ChannelMix["channels"],
	totalCitations: number,
): ChannelMix {
	const subjectTotal = (id: string) => channels.reduce((sum, entry) => sum + (entry.bySubject[id]?.citations ?? 0), 0);
	const shownCompetitors = subjects
		.slice(1)
		.map(({ id, name, domain }) => ({ id, name, domain, total: subjectTotal(id) }))
		.filter((subject) => subject.total > 0)
		.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
		.slice(0, MAX_COMPETITORS);
	const shown = new Set([BRAND_SUBJECT_ID, ...shownCompetitors.map((subject) => subject.id)]);

	return {
		totalCitations,
		subjects: [
			{ id: BRAND_SUBJECT_ID, name: subjects[0].name, domain: subjects[0].domain, kind: "brand" },
			...shownCompetitors.map(({ id, name, domain }) => ({ id, name, domain, kind: "competitor" as const })),
		],
		channels: channels
			.filter((entry) => entry.citations > 0)
			.map((entry) => ({
				...entry,
				bySubject: Object.fromEntries(Object.entries(entry.bySubject).filter(([id]) => shown.has(id))),
				topPages: entry.topPages
					.map((page) => ({ ...page, subjectIds: page.subjectIds.filter((id) => shown.has(id)) }))
					.filter((page) => page.subjectIds.length > 0)
					.sort((a, b) => b.count - a.count || a.url.localeCompare(b.url))
					.slice(0, MAX_PAGES_PER_CHANNEL),
			}))
			.sort((a, b) => b.citations - a.citations || a.label.localeCompare(b.label))
			.slice(0, MAX_CHANNELS),
	};
}
