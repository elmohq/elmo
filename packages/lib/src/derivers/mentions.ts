import { analyzeMentions, MENTIONS_VERSION, type MentionSubject, normalizeDomain } from "../mentions";
import type { BrandContext, DerivedColumns, Deriver, DeriverInput } from "./types";

/**
 * Two configurations that match the same text must hash alike, otherwise
 * reordering competitors or fixing the capitalization of an alias would restamp
 * — and so reprocess — every run in the brand's history. Competitor names are
 * the exception: they are stored verbatim in `competitors_mentioned` and key
 * the rollups, so a rename must restamp even when only the case changed.
 */
function canonicalTerms(terms: readonly string[]): string[] {
	return [...new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean))].sort();
}

function canonicalDomains(domains: readonly string[]): string[] {
	return canonicalTerms(domains.map((domain) => normalizeDomain(domain)));
}

function brandSubject(ctx: BrandContext): MentionSubject {
	return {
		name: ctx.brand.name,
		aliases: ctx.brand.aliases,
		domains: [ctx.brand.website, ...ctx.brand.additionalDomains],
	};
}

export const mentionsDeriver: Deriver = {
	name: "mentions",
	version: MENTIONS_VERSION,
	needs: "text",

	fingerprint(ctx: BrandContext): string {
		return JSON.stringify({
			names: canonicalTerms([ctx.brand.name, ...ctx.brand.aliases]),
			domains: canonicalDomains([ctx.brand.website, ...ctx.brand.additionalDomains]),
			competitors: ctx.competitors
				.map((competitor) => ({
					name: competitor.name.trim(),
					aliases: canonicalTerms(competitor.aliases),
					domains: canonicalDomains(competitor.domains),
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		});
	},

	derive(input: DeriverInput, ctx: BrandContext): DerivedColumns {
		return analyzeMentions(input.textContent ?? "", brandSubject(ctx), ctx.competitors);
	},
};
