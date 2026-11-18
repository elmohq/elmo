/**
 * The filters that decide which prompts an analytics read covers. Server
 * functions spread `promptScopeFields` into their validators and hand
 * `promptScopeOf` on, so a filter added here reaches every read at once.
 */
import { parseCountryFilter, parseLanguageFilter, resolveMarket } from "@workspace/config/markets";
import { z } from "zod";

export const promptScopeFields = {
	/** Comma-joined tags; a prompt carrying any of them matches. */
	tags: z.string().optional(),
	/** Comma-joined country codes; a prompt asked from any of them matches. */
	countries: z.string().optional(),
	/** Comma-joined language codes; a prompt written in any of them matches. */
	languages: z.string().optional(),
};

export interface PromptScope {
	tags?: string;
	countries?: string;
	languages?: string;
}

export function promptScopeOf(data: PromptScope): PromptScope {
	return { tags: data.tags, countries: data.countries, languages: data.languages };
}

/** Either filter left empty matches every prompt; with both, a prompt must match both. */
export function localeFilter(
	scope: Pick<PromptScope, "countries" | "languages">,
	brand: { country: string; language: string },
): (prompt: { country: string | null; language: string | null }) => boolean {
	const countries = new Set(parseCountryFilter(scope.countries));
	const languages = new Set(parseLanguageFilter(scope.languages));
	if (countries.size === 0 && languages.size === 0) return () => true;
	return (prompt) => {
		const market = resolveMarket(prompt, brand);
		return (
			(countries.size === 0 || countries.has(market.country)) &&
			(languages.size === 0 || languages.has(market.language))
		);
	};
}

export interface LocaleUse {
	code: string;
	/** Enabled prompts asked from this country, or written in this language. */
	prompts: number;
}

function byUse(counts: Map<string, number>, own: string): LocaleUse[] {
	return [...counts]
		.map(([code, prompts]) => ({ code, prompts }))
		.sort(
			(a, b) =>
				Number(b.code === own) - Number(a.code === own) || b.prompts - a.prompts || a.code.localeCompare(b.code),
		);
}

/** The countries and languages a brand's enabled prompts use, the brand's own first and then the busiest. */
export function localesInUse(
	brand: { country: string; language: string },
	prompts: readonly { enabled: boolean; country: string | null; language: string | null }[],
): { countries: LocaleUse[]; languages: LocaleUse[] } {
	const countries = new Map<string, number>();
	const languages = new Map<string, number>();
	for (const prompt of prompts) {
		if (!prompt.enabled) continue;
		const market = resolveMarket(prompt, brand);
		countries.set(market.country, (countries.get(market.country) ?? 0) + 1);
		languages.set(market.language, (languages.get(market.language) ?? 0) + 1);
	}
	return { countries: byUse(countries, brand.country), languages: byUse(languages, brand.language) };
}
