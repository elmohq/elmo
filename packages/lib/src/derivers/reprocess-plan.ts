import type { Deriver } from "./types";

export interface StoredRunVersions {
	extractorVersion: number | null;
	textContent: string | null;
}

export interface RowWorkPlan {
	/** Whether raw_output must be re-parsed into text_content and citations. */
	needsExtraction: boolean;
	/**
	 * Whether raw_output has to be fetched at all: extraction reads it directly,
	 * a "needs: raw" deriver reads it directly, and a "needs: text" deriver reads
	 * text_content, which is only reachable from raw when that column is still
	 * unfilled.
	 */
	needsRaw: boolean;
}

/**
 * What a stored run needs before its stale derivers (already computed by the
 * caller via `staleDerivers`) can be recomputed. Kept independent of
 * `BrandContext` and the deriver registry so it is trivial to unit test: the
 * caller has already decided which derivers are stale, this just decides what
 * that requires reading.
 */
export function planRowWork(
	row: StoredRunVersions,
	extractionRequested: boolean,
	currentExtractorVersion: number,
	staleForRow: readonly Deriver[],
): RowWorkPlan {
	const needsExtraction = extractionRequested && row.extractorVersion !== currentExtractorVersion;
	const needsRaw =
		needsExtraction ||
		staleForRow.some((deriver) => deriver.needs === "raw") ||
		(staleForRow.length > 0 && row.textContent === null);
	return { needsExtraction, needsRaw };
}
