import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { REPROCESS_QUEUE } from "@workspace/lib/rollups/constants";
import { eq } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";

async function getPromptCadenceHours(promptId: string): Promise<number> {
	const defaultDelayHours = getDefaultDelayHours();
	try {
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			console.warn(`Prompt ${promptId} not found, using default cadence`);
			return defaultDelayHours;
		}

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, prompt.brandId),
		});

		if (!brand) {
			console.warn(`Brand ${prompt.brandId} not found, using default cadence`);
			return defaultDelayHours;
		}

		if (brand.delayOverrideHours !== null) {
			console.log(`Using custom cadence for brand ${brand.name}: ${brand.delayOverrideHours}h`);
			return brand.delayOverrideHours;
		}

		return defaultDelayHours;
	} catch (error) {
		console.error(`Error fetching cadence for prompt ${promptId}:`, error);
		return defaultDelayHours;
	}
}

/**
 * Creates a scheduled job for a prompt to run after a delay.
 * Uses interval-based scheduling with startAfter instead of cron patterns.
 * The job will self-reschedule after completion via the worker.
 */
type SchedulerOptions = {
	sendImmediate?: boolean;
};

export async function createPromptJobScheduler(promptId: string, options: SchedulerOptions = {}): Promise<boolean> {
	try {
		const boss = await getBoss();
		const cadenceHours = await getPromptCadenceHours(promptId);
		const sendImmediate = options.sendImmediate ?? true;

		// Clear a cron schedule when converting the prompt to self-rescheduling jobs.
		try {
			await boss.unschedule("process-prompt", promptId);
		} catch {
			// Absence is equivalent to a successfully cleared schedule.
		}

		if (sendImmediate) {
			await boss.send(
				"process-prompt",
				{ promptId, cadenceHours },
				{
					singletonKey: `prompt-${promptId}`,
					singletonSeconds: 60 * 60, // 1 hour - prevent duplicate jobs
					retryLimit: 3,
					retryDelay: 60,
					retryBackoff: true,
					expireInSeconds: 60 * 15, // 15 minute timeout
				},
			);
		} else {
			const startAfterSeconds = cadenceHours * 60 * 60;
			await boss.send(
				"process-prompt",
				{ promptId, cadenceHours },
				{
					singletonKey: `prompt-${promptId}`,
					singletonSeconds: startAfterSeconds, // Prevent duplicates for the cadence period
					startAfter: startAfterSeconds,
					retryLimit: 3,
					retryDelay: 60,
					retryBackoff: true,
					expireInSeconds: 60 * 15,
				},
			);
		}

		console.log(`Created job for prompt ${promptId} with ${cadenceHours}h cadence`);
		return true;
	} catch (error) {
		console.error(`Failed to create job for prompt ${promptId}:`, error);
		return false;
	}
}

export async function removePromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		const boss = await getBoss();

		try {
			await boss.unschedule("process-prompt", promptId);
		} catch {
			// Absence is equivalent to a successfully removed schedule.
		}

		console.log(`Removed schedule for prompt ${promptId}`);
		return true;
	} catch (error) {
		console.error(`Failed to remove job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

export async function createMultiplePromptJobSchedulers(
	promptIds: string[],
	options: SchedulerOptions = {},
): Promise<boolean[]> {
	const results = await Promise.allSettled(promptIds.map((promptId) => createPromptJobScheduler(promptId, options)));

	return results.map((result) => (result.status === "fulfilled" ? result.value : false));
}

/**
 * Ask the worker to re-derive this brand's history against its current name,
 * aliases, and competitors. Debounced per brand, because a settings screen
 * saves several fields in a row and the job re-reads the whole brand anyway.
 *
 * Never throws: the caller's write has already committed, and the nightly
 * reconcile plus the next config change both bring the brand back in line.
 */
export async function requestBrandReprocess(brandId: string): Promise<void> {
	try {
		const boss = await getBoss();
		await boss.send(
			REPROCESS_QUEUE,
			{ brandId, layers: ["interpretation"] },
			{ singletonKey: `reprocess:${brandId}`, singletonSeconds: 60 },
		);
	} catch (error) {
		console.error(`Failed to request reprocess for brand ${brandId}:`, error);
	}
}

/**
 * Sends an immediate job to process a prompt (outside of the schedule).
 * Useful for manual retries from the admin UI.
 */
export async function sendImmediatePromptJob(promptId: string): Promise<boolean> {
	try {
		const boss = await getBoss();
		const cadenceHours = await getPromptCadenceHours(promptId);

		await boss.send(
			"process-prompt",
			{ promptId, cadenceHours },
			{
				retryLimit: 3,
				retryDelay: 60,
				retryBackoff: true,
				expireInSeconds: 60 * 15,
			},
		);

		console.log(`Sent immediate job for prompt ${promptId}`);
		return true;
	} catch (error) {
		console.error(`Failed to send immediate job for prompt ${promptId}:`, error);
		return false;
	}
}

export async function sendReportJob(
	reportId: string,
	brandName: string,
	brandWebsite: string,
	manualPrompts?: string[],
): Promise<boolean> {
	try {
		const boss = await getBoss();

		await boss.send(
			"generate-report",
			{ reportId, brandName, brandWebsite, manualPrompts },
			{
				retryLimit: 3,
				retryDelay: 60,
				retryBackoff: true,
				expireInSeconds: 60 * 60, // 1 hour timeout for reports
			},
		);

		console.log(`Sent report job for report ${reportId}`);
		return true;
	} catch (error) {
		console.error(`Failed to send report job for report ${reportId}:`, error);
		return false;
	}
}
