import { getDefaultDelayHours } from "@workspace/lib/constants";
import { REPORT_GENERATION_DEADLINE_MS, REPORT_QUEUE, REPORT_QUEUE_OPTIONS } from "@workspace/lib/scheduler";
import { db } from "@workspace/lib/db/db";
import { brands, promptSchedules, prompts } from "@workspace/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";

/**
 * Convert cadence hours to milliseconds.
 */
export function hoursToMs(hours: number): number {
	return hours * 60 * 60 * 1000;
}

/**
 * Gets the cadence (delay between runs) for a prompt based on its brand's delay override or the default
 */
export async function getPromptCadenceHours(promptId: string): Promise<number> {
	const defaultDelayHours = getDefaultDelayHours();
	try {
		// Get the prompt to find its brand
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			console.warn(`Prompt ${promptId} not found, using default cadence`);
			return defaultDelayHours;
		}

		// Get the brand to check for delay override
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, prompt.brandId),
		});

		if (!brand) {
			console.warn(`Brand ${prompt.brandId} not found, using default cadence`);
			return defaultDelayHours;
		}

		// Use override if set, otherwise use default
		if (brand.delayOverrideHours !== null && brand.delayOverrideHours > 0) {
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
 * Creates durable scheduling intent for a prompt.
 */
type SchedulerOptions = {
	sendImmediate?: boolean;
};

export async function createPromptJobScheduler(promptId: string, options: SchedulerOptions = {}): Promise<boolean> {
	try {
		const cadenceHours = await getPromptCadenceHours(promptId);
		const sendImmediate = options.sendImmediate ?? true;
		const now = new Date();
		const nextRunAt = sendImmediate ? now : new Date(now.getTime() + hoursToMs(cadenceHours));

		await db
			.insert(promptSchedules)
			.values({ promptId, nextRunAt, updatedAt: now })
			.onConflictDoUpdate({
				target: promptSchedules.promptId,
				set: { nextRunAt, updatedAt: now },
			});

		console.log(
			`Created schedule for prompt ${promptId} ${sendImmediate ? "to run immediately" : `in ${cadenceHours}h`}`,
		);
		return true;
	} catch (error) {
		console.error(`Failed to create schedule for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Removes any scheduled jobs for a prompt.
 */
export async function removePromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		await db.delete(promptSchedules).where(eq(promptSchedules.promptId, promptId));
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
export async function createMultiplePromptJobSchedulers(
	promptIds: string[],
	options: SchedulerOptions = {},
): Promise<boolean[]> {
	const results = await Promise.allSettled(promptIds.map((promptId) => createPromptJobScheduler(promptId, options)));

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
export async function recreatePromptJobScheduler(promptId: string, options: SchedulerOptions = {}): Promise<boolean> {
	try {
		// Remove existing schedule if any (ignore errors if it doesn't exist)
		await removePromptJobScheduler(promptId);
		// Create new schedule
		return await createPromptJobScheduler(promptId, options);
	} catch (error) {
		console.error(`Failed to recreate job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Requests one manual prompt run. Keeping the oldest pending request makes
 * repeated clicks converge on one execution while preserving a request that a
 * worker has already observed.
 */
export async function sendImmediatePromptJob(promptId: string): Promise<boolean> {
	try {
		const cadenceHours = await getPromptCadenceHours(promptId);
		const requestedAt = new Date();
		const nextRunAt = new Date(requestedAt.getTime() + hoursToMs(cadenceHours));

		await db
			.insert(promptSchedules)
			.values({ promptId, nextRunAt, runRequestedAt: requestedAt, updatedAt: requestedAt })
			.onConflictDoUpdate({
				target: promptSchedules.promptId,
				set: {
					runRequestedAt: sql`COALESCE(${promptSchedules.runRequestedAt}, ${requestedAt})`,
					updatedAt: requestedAt,
				},
			});

		console.log(`Requested immediate run for prompt ${promptId}`);
		return true;
	} catch (error) {
		console.error(`Failed to request immediate run for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Schedules the next run for a prompt after a delay.
 * Called by the worker after successful job completion.
 */
export async function scheduleNextPromptRun(promptId: string, cadenceHours: number): Promise<boolean> {
	try {
		const now = new Date();
		const nextRunAt = new Date(now.getTime() + hoursToMs(cadenceHours));
		const [updatedSchedule] = await db
			.update(promptSchedules)
			.set({ nextRunAt, updatedAt: now })
			.where(eq(promptSchedules.promptId, promptId))
			.returning({ promptId: promptSchedules.promptId });

		if (!updatedSchedule) {
			console.warn(`Could not schedule next run for prompt ${promptId}: schedule does not exist`);
			return false;
		}

		console.log(`Scheduled next run for prompt ${promptId} in ${cadenceHours}h`);
		return true;
	} catch (error) {
		console.error(`Failed to schedule next run for prompt ${promptId}:`, error);
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
			REPORT_QUEUE,
			{
				reportId,
				brandName,
				brandWebsite,
				manualPrompts,
				generationDeadlineAt: new Date(Date.now() + REPORT_GENERATION_DEADLINE_MS).toISOString(),
			},
			{ ...REPORT_QUEUE_OPTIONS, id: reportId },
		);

		console.log(`Sent report job for report ${reportId}`);
		return true;
	} catch (error) {
		console.error(`Failed to send report job for report ${reportId}:`, error);
		return false;
	}
}
