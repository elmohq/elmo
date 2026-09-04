/**
 * A deriver turns one stored run into typed columns on `prompt_runs`. Keeping
 * that step pure and declaring what it reads is what makes history replayable:
 * the stamp of `version` plus `fingerprint(ctx)` says whether a stored row was
 * produced by today's code and today's brand configuration.
 */

export interface DeriverInput {
	textContent: string | null;
	rawOutput: unknown;
	provider: string | null;
	model: string;
}

export interface BrandContext {
	brand: { name: string; aliases: string[]; website: string; additionalDomains: string[] };
	competitors: { name: string; aliases: string[]; domains: string[] }[];
}

/** One optional key per `prompt_runs` column any deriver may write. */
export interface DerivedColumns {
	brandMentioned?: boolean;
	competitorsMentioned?: string[];
}

export interface Deriver {
	name: string;
	version: number;
	/** Derivers that only read extracted text replay cheaply; `raw` ones re-read the payload. */
	needs: "text" | "raw";
	/** The configuration this deriver reads, canonicalized so equivalent config hashes alike. */
	fingerprint(ctx: BrandContext): string;
	derive(input: DeriverInput, ctx: BrandContext): DerivedColumns;
}
