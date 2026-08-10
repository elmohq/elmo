import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, promptSchedules, prompts } from "@workspace/lib/db/schema";
import { REPORT_GENERATION_DEADLINE_MS, REPORT_QUEUE, REPORT_QUEUE_OPTIONS } from "@workspace/lib/scheduler";
import { eq, sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";

/**
 * Convert cadence hours to milliseconds.
 */
function hoursToMs(hours: number): number {
	return hours * 60 * 60 * 1000;
}

/**
 * Gets the cadence (delay between runs) for a prompt based on its brand's delay override or the default
 */
async function getPromptCadenceHours(promptId: string): Promise<number> {
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

/** Stop an in-progress schedule claim without discarding durable safety pauses. */
export async function removePromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		await db
			.update(promptSchedules)
			.set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
			.where(eq(promptSchedules.promptId, promptId));
		console.log(`Deactivated schedule for prompt ${promptId}`);
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
