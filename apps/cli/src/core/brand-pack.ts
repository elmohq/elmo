import fs from "node:fs/promises";
import path from "node:path";
import type { MentionConfig } from "@workspace/lib/mentions";
import type { OnboardingCompetitor, OnboardingPrompt, OnboardingSuggestion } from "@workspace/lib/onboarding";
import type { ReportCompetitor } from "@workspace/lib/report-metrics";

export interface PlanSuggestion {
	title: string;
	category: string;
	priority: string;
	recommendation: string;
	evidence?: string;
}

/**
 * The pipe artifact shared between `lab` commands. `brainstorm` and `plan`
 * write it (`brand.json`); `eval` reads it for the brand + competitor context
 * it needs to compute mentions and share-of-voice. Shaped like the onboarding
 * `OnboardingSuggestion` but with `prompts` (not `suggestedPrompts`) and an
 * optional `suggestions` list contributed by `plan`.
 */
export interface BrandPack {
	brandName: string;
	website: string;
	aliases: string[];
	additionalDomains: string[];
	competitors: OnboardingCompetitor[];
	prompts: OnboardingPrompt[];
	suggestions?: PlanSuggestion[];
}

export function suggestionToBrandPack(s: OnboardingSuggestion): BrandPack {
	return {
		brandName: s.brandName,
		website: s.website,
		aliases: s.aliases ?? [],
		additionalDomains: s.additionalDomains ?? [],
		competitors: s.competitors ?? [],
		prompts: s.suggestedPrompts ?? [],
	};
}

/** Read a brand pack, tolerating either `prompts` or `suggestedPrompts` keys. */
export async function readBrandPack(filePath: string): Promise<BrandPack> {
	const resolved = path.resolve(process.cwd(), filePath);
	let parsed: unknown;
	try {
		parsed = JSON.parse(await fs.readFile(resolved, "utf8"));
	} catch (err) {
		throw new Error(`Could not read brand pack at ${resolved}: ${err instanceof Error ? err.message : String(err)}`);
	}
	const obj = (parsed ?? {}) as Record<string, unknown>;
	const prompts = (obj.prompts ?? obj.suggestedPrompts ?? []) as OnboardingPrompt[];
	if (!obj.brandName && !obj.website) {
		throw new Error(`Brand pack at ${resolved} is missing both brandName and website.`);
	}
	return {
		brandName: String(obj.brandName ?? ""),
		website: String(obj.website ?? ""),
		aliases: (obj.aliases as string[]) ?? [],
		additionalDomains: (obj.additionalDomains as string[]) ?? [],
		competitors: (obj.competitors as OnboardingCompetitor[]) ?? [],
		prompts,
		suggestions: obj.suggestions as PlanSuggestion[] | undefined,
	};
}

export function toMentionBrand(
	pack: Pick<BrandPack, "brandName" | "website" | "aliases" | "additionalDomains">,
): MentionConfig["brand"] {
	return {
		name: pack.brandName,
		aliases: pack.aliases ?? [],
		domains: [pack.website, ...(pack.additionalDomains ?? [])].filter((domain): domain is string => Boolean(domain)),
	};
}

export function toMentionCompetitors(competitors: OnboardingCompetitor[]): MentionConfig["competitors"] {
	return competitors.map((c) => ({ name: c.name, aliases: c.aliases ?? [], domains: c.domains ?? [] }));
}

export function toReportCompetitors(competitors: OnboardingCompetitor[]): ReportCompetitor[] {
	return competitors.map((c) => ({ name: c.name, domain: c.domains[0] ?? "" }));
}
