import { DEFAULT_COUNTRY } from "@workspace/config/countries";

/** The countries a brand's enabled prompts run from, most prompts first. */
export function countriesInUse(prompts: readonly { country: string; enabled: boolean }[]): string[] {
	const counts = new Map<string, number>();
	for (const prompt of prompts) {
		if (prompt.enabled) counts.set(prompt.country, (counts.get(prompt.country) ?? 0) + 1);
	}
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([country]) => country);
}

/** Where a new prompt starts: wherever most of the brand's prompts already run. */
export function defaultCountryForNewPrompts(prompts: readonly { country: string; enabled: boolean }[]): string {
	return countriesInUse(prompts)[0] ?? DEFAULT_COUNTRY;
}
