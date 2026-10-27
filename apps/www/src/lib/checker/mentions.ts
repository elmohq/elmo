import type { PromptResult, Source } from "./types";

export interface BrandIdentity {
	name: string;
	aliases: string[];
	domain: string;
}

const WORD_CHAR = String.raw`[[\p{L}\p{N}]--[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]]`;

function wholeWord(term: string): RegExp {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<!${WORD_CHAR})${escaped}(?!${WORD_CHAR})`, "iv");
}

function brandTerms(brand: BrandIdentity): string[] {
	return [brand.name, ...brand.aliases, brand.domain].map((term) => term.trim()).filter((term) => term.length >= 2);
}

export function firstMention(text: string, terms: string[]): number {
	let first = -1;
	for (const term of terms) {
		const index = text.search(wholeWord(term));
		if (index !== -1 && (first === -1 || index < first)) first = index;
	}
	return first;
}

export function mentionsBrand(text: string, brand: BrandIdentity): boolean {
	return firstMention(text, brandTerms(brand)) !== -1;
}

export function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return null;
	}
}

export function isOwnUrl(url: string, domain: string): boolean {
	const host = hostOf(url);
	return host !== null && (host === domain || host.endsWith(`.${domain}`));
}

function sameBrand(candidate: string, brand: BrandIdentity): boolean {
	const name = candidate.trim().toLowerCase();
	if (!name) return false;
	return brandTerms(brand).some((term) => {
		const lowered = term.toLowerCase();
		return name === lowered || wholeWord(lowered).test(name) || wholeWord(name).test(lowered);
	});
}

export function analyzeAnswer({
	text,
	sources,
	brand,
	namedBrands,
}: {
	text: string;
	sources: Source[];
	brand: BrandIdentity;
	namedBrands: string[];
}): Omit<PromptResult, "prompt"> {
	const seen = new Set<string>();
	const competitors = namedBrands
		.map((name) => name.trim())
		.filter((name) => {
			const key = name.toLowerCase();
			if (!name || seen.has(key) || sameBrand(name, brand)) return false;
			seen.add(key);
			return true;
		});

	const brandAt = firstMention(text, brandTerms(brand));
	const mentioned = brandAt !== -1;

	const ordered = competitors
		.map((name) => ({ name, at: firstMention(text, [name]) }))
		.filter((entry) => entry.at !== -1)
		.sort((a, b) => a.at - b.at);

	const position = mentioned ? ordered.filter((entry) => entry.at < brandAt).length + 1 : null;

	return {
		mentioned,
		position,
		competitors: ordered.map((entry) => entry.name),
		cited: sources.some((source) => isOwnUrl(source.url, brand.domain)),
		sources,
	};
}

export function tallyCompetitors(results: Pick<PromptResult, "competitors">[], limit = 8) {
	const counts = new Map<string, { name: string; count: number }>();
	for (const result of results) {
		for (const name of result.competitors) {
			const key = name.toLowerCase();
			const entry = counts.get(key) ?? { name, count: 0 };
			entry.count += 1;
			counts.set(key, entry);
		}
	}
	return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

export function tallySources(results: Pick<PromptResult, "sources">[], limit = 8) {
	const counts = new Map<string, number>();
	for (const result of results) {
		for (const domain of new Set(result.sources.map((source) => source.domain))) {
			counts.set(domain, (counts.get(domain) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([domain, count]) => ({ domain, count }))
		.sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
		.slice(0, limit);
}
