/**
 * Which of a brand's prompts a dashboard read covers: the tag and market
 * filters every analytics page shares. Defined once so a new page or endpoint
 * picks up every filter by spreading these, rather than listing them and
 * missing the one added last.
 */
import { z } from "zod";

/** Validator fields for a server function, each a comma-joined list. */
export const promptScopeFields = {
	tags: z.string().optional(),
	/** Country codes; a prompt in any of them matches. */
	countries: z.string().optional(),
	/** Language codes, matched the same way. */
	languages: z.string().optional(),
};

export interface PromptScope {
	tags?: string;
	countries?: string;
	languages?: string;
}

export function pickPromptScope(data: PromptScope): PromptScope {
	return { tags: data.tags, countries: data.countries, languages: data.languages };
}

/** The same filters as the dashboard holds them, before they're joined for a request. */
export interface PromptScopeFilters {
	tags?: string[];
	countries?: string[];
	languages?: string[];
}

export function promptScopeParams(filters?: PromptScopeFilters): PromptScope {
	return {
		tags: filters?.tags?.join(","),
		countries: filters?.countries?.join(","),
		languages: filters?.languages?.join(","),
	};
}
