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

const BOILERPLATE =
	/(^|-)(careers?|jobs?|legal|privacy|terms|tos|cookies?|polic(y|ies)|agreements?|disclosures?|dpa|compliance)(-|$)/;

const NON_ENGLISH_LOCALE =
	/^(ar|bg|bn|br|ca|cs|da|de|el|es|et|fa|fi|fr|he|hi|hr|hu|id|it|ja|ko|lt|lv|ms|nb|nl|no|pl|pt|ro|ru|sk|sl|sr|sv|th|tr|uk|vi|zh|zhs|zht)([-_][a-z]{2,4})?$/i;

function segments(page: string): string[] {
	return new URL(page).pathname.toLowerCase().replace(/\/+$/, "").split("/").filter(Boolean);
}

const LOCALE_SHAPED = /^[a-z]{2,3}([-_][a-z]{2,4})?$/i;

// Translations repeat the default-language pages, so they say little about the site an agent reads first.
// A locale-shaped segment marks a translation when it's a known non-English locale, or when dropping it
// gives another page on the site.
function fallbackTest(pages: string[]): (page: string) => boolean {
	const paths = new Set(pages.map((page) => segments(page).join("/")));
	const isTranslation = (parts: string[]) =>
		parts.slice(0, 2).some((part, index) => {
			if (!LOCALE_SHAPED.test(part)) return false;
			const untranslated = parts.filter((_, other) => other !== index).join("/");
			return NON_ENGLISH_LOCALE.test(part) || (untranslated !== "" && paths.has(untranslated));
		});
	return (page) => {
		const parts = segments(page);
		return parts.some((part) => BOILERPLATE.test(part)) || isTranslation(parts);
	};
}

function eligibility(origin: string, isAllowed: (url: string) => boolean) {
	return (url: string): string | undefined => {
		const page = canonicalPage(url);
		if (!page) return undefined;
		const parsed = new URL(page);
		if (parsed.origin !== origin || NON_PAGE.test(parsed.pathname) || !isAllowed(page)) return undefined;
		return page;
	};
}

function sections(origin: string, pages: string[]): string[][] {
	const bySection = new Map<string, Set<string>>();
	for (const page of pages) {
		const key = section(new URL(page));
		bySection.set(key, (bySection.get(key) ?? new Set()).add(page));
	}
	const byRank = (a: string, b: string) => rank(origin, a).localeCompare(rank(origin, b));
	// The largest sections are a site's main pillars, so they're sampled before one-off pages.
	const bySize = (a: string, b: string) =>
		(bySection.get(b)?.size ?? 0) - (bySection.get(a)?.size ?? 0) || byRank(a, b);
	return [...bySection.keys()].sort(bySize).map((key) => [...(bySection.get(key) ?? [])].sort(byRank));
}

/**
 * The homepage, then pages the caller already knows matter, then candidates
 * spread across the site's top-level sections, with legal, careers, and
 * translated pages only if nothing else is left. The order is fixed by a hash
 * of the origin, so the same pages come back on every run.
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
	const isFallback = fallbackTest(rest);
	for (const pool of [rest.filter((page) => !isFallback(page)), rest.filter(isFallback)]) {
		const groups = sections(origin, pool);
		const deepest = Math.max(0, ...groups.map((group) => group.length));
		for (let round = 0; round < deepest && picked.size < limit; round++) {
			for (const group of groups) add(group[round]);
		}
	}
	return [...picked];
}
