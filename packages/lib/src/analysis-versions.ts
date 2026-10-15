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

/** `judgeVersion` is the mention judge's, when the worker has one; see `mentionsStamp`. */
export function currentAnalysisVersions(config: MentionConfig, judgeVersion?: string | null): AnalysisVersions {
	return { [EXTRACTION_KEY]: String(EXTRACTOR_VERSION), [MENTIONS_KEY]: mentionsStamp(config, judgeVersion) };
}
