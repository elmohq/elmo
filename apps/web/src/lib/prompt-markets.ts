import { DEFAULT_COUNTRY } from "@workspace/config/countries";
import { DEFAULT_LANGUAGE } from "@workspace/config/languages";

type MarketPrompt = { country: string; language: string; enabled: boolean };

/** Distinct values of `key` across a brand's enabled prompts, most prompts first. */
function inUse(prompts: readonly MarketPrompt[], key: "country" | "language"): string[] {
	const counts = new Map<string, number>();
	for (const prompt of prompts) {
		if (prompt.enabled) counts.set(prompt[key], (counts.get(prompt[key]) ?? 0) + 1);
	}
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
}

export function countriesInUse(prompts: readonly MarketPrompt[]): string[] {
	return inUse(prompts, "country");
}

export function languagesInUse(prompts: readonly MarketPrompt[]): string[] {
	return inUse(prompts, "language");
}

/** Where a new prompt starts: wherever, and in whatever language, most of the brand's prompts already are. */
export function defaultMarketForNewPrompts(prompts: readonly MarketPrompt[]): { country: string; language: string } {
	return {
		country: countriesInUse(prompts)[0] ?? DEFAULT_COUNTRY,
		language: languagesInUse(prompts)[0] ?? DEFAULT_LANGUAGE,
	};
}

/** "GB · en" — compact enough for a card title or a chip. */
export function marketLabel(prompt: { country: string; language: string }): string {
	return `${prompt.country} · ${prompt.language}`;
}
