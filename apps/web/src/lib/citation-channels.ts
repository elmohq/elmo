/**
 * Which channels AI answers cite, and how often the answers citing each one
 * mention the brand and its competitors.
 *
 * A citation counts for a company when the answer that made it mentions the
 * company, whatever the cited page says about it. Own Website is the exception:
 * there a citation counts for the company whose domain it points at.
 */
import { extractDomain, inDomainSet } from "@workspace/lib/citations/domain-categories";
import type { StaticCategory } from "@workspace/lib/citations/page-classification";

const BRAND_SUBJECT_ID = "brand";
export const OWNED_CHANNEL = "owned";
const MAX_COMPETITORS = 7;
const MAX_CHANNELS = 10;

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

interface ChannelSubjectInput {
	id: string;
	name: string;
	domains: string[];
}

interface ChannelDomainRow {
	domain: string;
	static_category: StaticCategory;
	count: number;
	/** Citations from answers that mention the brand. */
	brand_count: number;
}

export interface ChannelRows {
	domains: ChannelDomainRow[];
	/** Citations from answers that mention the competitor. */
	competitors: (Omit<ChannelDomainRow, "brand_count"> & { competitor_name: string })[];
}

type SubjectCounts = Record<string, number>;

export interface ChannelMix {
	totalCitations: number;
	subjects: { id: string; name: string; kind: "brand" | "competitor"; domain?: string }[];
	/** Across every channel, the citations from answers that mention each subject. */
	overall: SubjectCounts;
	channels: {
		key: string;
		label: string;
		citations: number;
		bySubject: SubjectCounts;
	}[];
}

type Channel = ChannelMix["channels"][number];

const add = (counts: SubjectCounts, id: string | undefined, count: number) => {
	if (id && count > 0) counts[id] = (counts[id] ?? 0) + count;
};

const only = (counts: SubjectCounts, shown: Set<string>): SubjectCounts =>
	Object.fromEntries(Object.entries(counts).filter(([id]) => shown.has(id)));

function channelTally() {
	const channels = new Map<string, Channel>();
	return {
		channels,
		of(row: { domain: string; static_category: StaticCategory }, owner: string | undefined): Channel {
			const key = owner ? OWNED_CHANNEL : channelFor(row.domain, row.static_category);
			let entry = channels.get(key);
			if (!entry) {
				entry = { key, label: CHANNEL_LABELS[key], citations: 0, bySubject: {} };
				channels.set(key, entry);
			}
			return entry;
		},
	};
}

export function buildChannelMix(args: {
	rows: ChannelRows;
	brand: Omit<ChannelSubjectInput, "id">;
	competitors: ChannelSubjectInput[];
}): ChannelMix {
	const subjects = [{ ...args.brand, id: BRAND_SUBJECT_ID }, ...args.competitors].map((subject) => {
		const domains = subject.domains.map(extractDomain).filter(Boolean);
		return { id: subject.id, name: subject.name, domain: domains[0], domains: new Set(domains) };
	});
	const ownerOf = (domain: string) => subjects.find((subject) => inDomainSet(domain, subject.domains))?.id;
	// The mentions rollup knows competitors by name.
	const idByName = new Map(args.competitors.map((competitor) => [competitor.name, competitor.id]));

	const tally = channelTally();
	const overall: SubjectCounts = {};
	let totalCitations = 0;
	for (const row of args.rows.domains) {
		const owner = ownerOf(row.domain);
		const entry = tally.of(row, owner);
		totalCitations += row.count;
		entry.citations += row.count;
		add(overall, BRAND_SUBJECT_ID, row.brand_count);
		add(entry.bySubject, owner ?? BRAND_SUBJECT_ID, owner ? row.count : row.brand_count);
	}
	for (const row of args.rows.competitors) {
		const id = idByName.get(row.competitor_name);
		add(overall, id, row.count);
		const owner = ownerOf(row.domain);
		if (!owner) add(tally.of(row, owner).bySubject, id, row.count);
	}
	return shapeChannelMix(subjects, [...tally.channels.values()], overall, totalCitations);
}

function shapeChannelMix(
	subjects: { id: string; name: string; domain?: string }[],
	channels: Channel[],
	overall: SubjectCounts,
	totalCitations: number,
): ChannelMix {
	const shownCompetitors = subjects
		.slice(1)
		.filter((subject) => (overall[subject.id] ?? 0) > 0)
		.sort((a, b) => overall[b.id] - overall[a.id] || a.name.localeCompare(b.name))
		.slice(0, MAX_COMPETITORS);
	const shown = new Set([BRAND_SUBJECT_ID, ...shownCompetitors.map((subject) => subject.id)]);

	return {
		totalCitations,
		subjects: [subjects[0], ...shownCompetitors].map(({ id, name, domain }) => ({
			id,
			name,
			domain,
			kind: id === BRAND_SUBJECT_ID ? ("brand" as const) : ("competitor" as const),
		})),
		overall: only(overall, shown),
		channels: channels
			.filter((entry) => entry.citations > 0)
			.sort((a, b) => b.citations - a.citations || a.label.localeCompare(b.label))
			.slice(0, MAX_CHANNELS)
			.map((entry) => ({ ...entry, bySubject: only(entry.bySubject, shown) })),
	};
}
