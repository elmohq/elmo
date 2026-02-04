import { db } from "@workspace/lib/db/db";
import { prompts, brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_DELAY_HOURS } from "@workspace/lib/constants";
import { getBoss } from "@/lib/boss-client";

/**
 * Convert cadence hours to a cron expression.
 * pg-boss uses standard cron format: minute hour day-of-month month day-of-week
 *
 * Examples:
 * - 6 hours → "0 *\/6 * * *" (every 6 hours at minute 0)
 * - 12 hours → "0 *\/12 * * *" (every 12 hours)
 * - 24 hours → "0 0 * * *" (daily at midnight)
 * - 48 hours → "0 0 *\/2 * *" (every 2 days at midnight)
 * - 72 hours → "0 0 *\/3 * *" (every 3 days at midnight)
 */
export function hoursToCron(hours: number): string {
	if (hours <= 0) {
		throw new Error("Hours must be positive");
	}

	if (hours < 24) {
		// For sub-daily intervals, run every N hours
		// "0 */N * * *" means at minute 0, every N hours
		return `0 */${hours} * * *`;
	}

	// For >= 24 hours, convert to days
	const days = Math.round(hours / 24);
	if (days === 1) {
		// Daily at midnight
		return "0 0 * * *";
	}

	// Every N days at midnight
	return `0 0 */${days} * *`;
}

/**
 * Gets the cadence (delay between runs) for a prompt based on its brand's delay override or the default
 */
export async function getPromptCadenceHours(promptId: string): Promise<number> {
	try {
		// Get the prompt to find its brand
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			console.warn(`Prompt ${promptId} not found, using default cadence`);
			return DEFAULT_DELAY_HOURS;
		}

		// Get the brand to check for delay override
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, prompt.brandId),
		});

		if (!brand) {
			console.warn(`Brand ${prompt.brandId} not found, using default cadence`);
			return DEFAULT_DELAY_HOURS;
		}

		// Use override if set, otherwise use default
		if (brand.delayOverrideHours !== null) {
			console.log(`Using custom cadence for brand ${brand.name}: ${brand.delayOverrideHours}h`);
			return brand.delayOverrideHours;
		}

		return DEFAULT_DELAY_HOURS;
	} catch (error) {
		console.error(`Error fetching cadence for prompt ${promptId}:`, error);
		return DEFAULT_DELAY_HOURS;
	}
}

/**
 * Creates a schedule for a prompt to run on a recurring cadence.
 * Also sends an immediate job for the first run.
 */
export async function createPromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		const boss = await getBoss();
		const cadenceHours = await getPromptCadenceHours(promptId);

		// Use fixed job name with promptId as key for uniqueness
		// This way the worker can listen for "process-prompt" jobs
		// and the key ensures one schedule per prompt
		await boss.unschedule("process-prompt", promptId);

		// Create the recurring schedule - key ensures uniqueness per prompt
		const cron = hoursToCron(cadenceHours);
		await boss.schedule("process-prompt", cron, { promptId }, { tz: "UTC", key: promptId });

		// Also send an immediate job for first run
		await boss.send(
			"process-prompt",
			{ promptId },
			{
				singletonKey: `immediate-${promptId}`,
				singletonSeconds: 60 * 60, // 1 hour - prevent duplicate immediate jobs
				retryLimit: 3,
				retryDelay: 60,
				retryBackoff: true,
				expireInSeconds: 60 * 15, // 15 minute timeout
			},
		);

		console.log(`Created schedule for prompt ${promptId} with ${cadenceHours}h cadence`);
		return true;
	} catch (error) {
		console.error(`Failed to create job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Removes the schedule for a prompt.
 */
export async function removePromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		const boss = await getBoss();

		// Unschedule using the job name and prompt-specific key
		await boss.unschedule("process-prompt", promptId);

		console.log(`Removed schedule for prompt ${promptId}`);
		return true;
	} catch (error) {
		console.error(`Failed to remove job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Creates schedules for multiple prompts.
 * Returns an array of results indicating success/failure for each prompt.
 */
export async function createMultiplePromptJobSchedulers(promptIds: string[]): Promise<boolean[]> {
	const results = await Promise.allSettled(promptIds.map((promptId) => createPromptJobScheduler(promptId)));

	return results.map((result) => (result.status === "fulfilled" ? result.value : false));
}

/**
 * Removes schedules for multiple prompts.
 * Returns an array of results indicating success/failure for each prompt.
 */
export async function removeMultiplePromptJobSchedulers(promptIds: string[]): Promise<boolean[]> {
	const results = await Promise.allSettled(promptIds.map((promptId) => removePromptJobScheduler(promptId)));

	return results.map((result) => (result.status === "fulfilled" ? result.value : false));
}

/**
 * Recreates a schedule for a prompt (removes and creates).
 * Useful when cadence has changed or job needs to be reset.
 */
export async function recreatePromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		// Remove existing schedule if any (ignore errors if it doesn't exist)
		await removePromptJobScheduler(promptId);
		// Create new schedule
		return await createPromptJobScheduler(promptId);
	} catch (error) {
		console.error(`Failed to recreate job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Sends an immediate job to process a prompt (outside of the schedule).
 * Useful for manual retries from the admin UI.
 */
export async function sendImmediatePromptJob(promptId: string): Promise<boolean> {
	try {
		const boss = await getBoss();

		await boss.send(
			"process-prompt",
			{ promptId },
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

/**
 * Sends a report generation job.
 */
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
