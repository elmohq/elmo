import { createHash } from "node:crypto";

function rank(seed: string, value: string): string {
	return createHash("sha256").update(`${seed}\n${value}`).digest("hex");
}

function section(url: URL): string {
	return url.pathname.split("/").filter(Boolean)[0] ?? "";
}

function canonicalPage(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		parsed.hash = "";
		return parsed.toString();
	} catch {
		return undefined;
	}
}

const NON_PAGE = /\.(pdf|png|jpe?g|gif|webp|svg|zip|xml|json|txt|mp4|mp3|css|js)$/i;

function eligibility(origin: string, isAllowed: (url: string) => boolean) {
	return (url: string): string | undefined => {
		const page = canonicalPage(url);
		if (!page) return undefined;
		const parsed = new URL(page);
		if (parsed.origin !== origin || NON_PAGE.test(parsed.pathname) || !isAllowed(page)) return undefined;
		return page;
	};
}

/** Candidates grouped by top-level section, each group and its pages in a stable hashed order. */
function sections(origin: string, pages: string[]): string[][] {
	const bySection = new Map<string, Set<string>>();
	for (const page of pages) {
		const key = section(new URL(page));
		bySection.set(key, (bySection.get(key) ?? new Set()).add(page));
	}
	const byRank = (a: string, b: string) => rank(origin, a).localeCompare(rank(origin, b));
	return [...bySection.keys()].sort(byRank).map((key) => [...(bySection.get(key) ?? [])].sort(byRank));
}

/**
 * The homepage, then pages the caller already knows matter, then candidates
 * spread across the site's top-level sections. The order is fixed by a hash of
 * the origin, so the same pages come back on every run.
 */
export function samplePages(options: {
	origin: string;
	priority: string[];
	candidates: string[];
	limit: number;
	isAllowed: (url: string) => boolean;
}): string[] {
	const { origin, limit } = options;
	const eligible = eligibility(origin, options.isAllowed);
	const picked = new Set<string>([`${origin}/`]);
	const add = (page: string | undefined) => {
		if (page && picked.size < limit) picked.add(page);
	};

	for (const url of options.priority) add(eligible(url));

	const rest = options.candidates
		.map(eligible)
		.filter((page): page is string => page !== undefined && !picked.has(page));
	const groups = sections(origin, rest);
	const deepest = Math.max(0, ...groups.map((group) => group.length));
	for (let round = 0; round < deepest && picked.size < limit; round++) {
		for (const group of groups) add(group[round]);
	}
	return [...picked];
}
