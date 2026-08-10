import { expeditePromptRuns as expedite } from "@workspace/lib/prompt-jobs";
import { getBoss } from "@/lib/boss-client";

/**
 * Expedite wrapper for the save paths: best-effort by design, because a
 * configuration save must not fail over scheduling. Maintenance reaches the
 * same state on its own, just later.
 */
export async function expeditePromptRuns(promptIds: string[]): Promise<void> {
	if (promptIds.length === 0) return;

	try {
		await expedite(await getBoss(), promptIds);
	} catch (error) {
		console.error("Failed to expedite prompt runs:", error);
	}
}
