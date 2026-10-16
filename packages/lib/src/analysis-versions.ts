import { type MentionConfig, mentionsStamp } from "./mentions";
import { EXTRACTOR_VERSION } from "./text-extraction";

/**
 * Derived layer -> the stamp of the code (and brand config) it was derived with.
 * Runs carry the stamps their columns were written under; a brand carries the
 * stamps its whole history was last brought to, so staleness is a comparison.
 */
export type AnalysisVersions = Record<string, string>;

export const EXTRACTION_KEY = "extraction";
export const MENTIONS_KEY = "mentions";

/** The extraction stamp alone: it depends on the code, not on any brand's config. */
export const EXTRACTION_STAMP = String(EXTRACTOR_VERSION);

/** The extraction stamp of a run whose text was filled in from its payload but whose citations are as recorded. */
export const LEGACY_EXTRACTION_STAMP = "legacy";

/** What brands that predate the judge carry: their mentions were matched by name, so all are stale. */
export const NAME_MATCHED_MENTIONS_STAMP = "name-matched";

export function currentAnalysisVersions(config: MentionConfig, judgeVersion: string): AnalysisVersions {
	return { [EXTRACTION_KEY]: EXTRACTION_STAMP, [MENTIONS_KEY]: mentionsStamp(config, judgeVersion) };
}
