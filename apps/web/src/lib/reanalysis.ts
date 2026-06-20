import { getBoss } from "@/lib/boss-client";

/**
 * Enqueue a re-analysis of all of a brand's historical prompt runs (and the
 * branded/unbranded system tags of its prompts). Call after brand identity
 * (name, aliases, website, domains) or competitors change so historical
 * mention data reflects the new settings.
 *
 * Fire-and-forget: enqueue failures are logged but never block the settings
 * save — the data just stays stale until the next change.
 */
export async function enqueueBrandReanalysis(brandId: string): Promise<void> {
	try {
		const boss = await getBoss();
		await boss.send(
			"reanalyze-brand",
			{ brandId },
			{
				singletonKey: `reanalyze-${brandId}`,
				singletonSeconds: 60, // debounce rapid consecutive settings edits
				retryLimit: 3,
				retryDelay: 60,
				retryBackoff: true,
				expireInSeconds: 60 * 60,
			},
		);
	} catch (error) {
		console.error(`Failed to enqueue re-analysis for brand ${brandId}:`, error);
	}
}
