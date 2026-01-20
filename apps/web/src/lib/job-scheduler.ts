import { promptQueue } from "@workspace/lib/queues";
import { db } from "@workspace/lib/db/db";
import { prompts, brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Queue } from "bullmq";

export const DEFAULT_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Gets the delay for a prompt based on its brand's delay override or the default
 */
export async function getPromptDelay(promptId: string): Promise<number> {
	try {
		// Get the prompt to find its brand
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});
		
		if (!prompt) {
			console.warn(`Prompt ${promptId} not found, using default delay`);
			return DEFAULT_DELAY_MS;
		}
		
		// Get the brand to check for delay override
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, prompt.brandId),
		});
		
		if (!brand) {
			console.warn(`Brand ${prompt.brandId} not found, using default delay`);
			return DEFAULT_DELAY_MS;
		}
		
		// Use override if set, otherwise use default
		if (brand.delayOverrideMs !== null) {
			console.log(`Using custom delay for brand ${brand.name}: ${brand.delayOverrideMs}ms`);
			return brand.delayOverrideMs;
		}
		
		return DEFAULT_DELAY_MS;
	} catch (error) {
		console.error(`Error fetching delay for prompt ${promptId}:`, error);
		return DEFAULT_DELAY_MS;
	}
}

/**
 * Creates or updates a repeatable job scheduler for a prompt
 * @param promptId - The prompt ID to create a scheduler for
 * @param queueOverride - Optional queue to use instead of the default environment-based queue
 */
export async function createPromptJobScheduler(promptId: string, queueOverride?: Queue): Promise<boolean> {
	try {
		const delay = await getPromptDelay(promptId);
		const queue = queueOverride ?? promptQueue;
		
		await queue.upsertJobScheduler(
			`repeater-${promptId}`,
			{
				every: delay,
			},
			{
				name: `prompt-${promptId}`, // Unique job name per prompt
				data: { promptId },
				opts: {
					attempts: 3,
					backoff: {
						type: "exponential",
						delay: 2000,
					},
					removeOnComplete: 5000,
					removeOnFail: 5000,
				},
			},
		);
		return true;
	} catch (error) {
		console.error(`Failed to create job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Removes a repeatable job scheduler for a prompt
 * @param promptId - The prompt ID to remove the scheduler for
 * @param queueOverride - Optional queue to use instead of the default environment-based queue
 */
export async function removePromptJobScheduler(promptId: string, queueOverride?: Queue): Promise<boolean> {
	try {
		const queue = queueOverride ?? promptQueue;
		await queue.removeJobScheduler(`repeater-${promptId}`);
		return true;
	} catch (error) {
		console.error(`Failed to remove job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Creates job schedulers for multiple prompts
 * Returns an array of results indicating success/failure for each prompt
 * @param promptIds - Array of prompt IDs to create schedulers for
 * @param queueOverride - Optional queue to use instead of the default environment-based queue
 */
export async function createMultiplePromptJobSchedulers(promptIds: string[], queueOverride?: Queue): Promise<boolean[]> {
	const results = await Promise.allSettled(promptIds.map((promptId) => createPromptJobScheduler(promptId, queueOverride)));

	return results.map((result) => (result.status === "fulfilled" ? result.value : false));
}

/**
 * Removes job schedulers for multiple prompts
 * Returns an array of results indicating success/failure for each prompt
 * @param promptIds - Array of prompt IDs to remove schedulers for
 * @param queueOverride - Optional queue to use instead of the default environment-based queue
 */
export async function removeMultiplePromptJobSchedulers(promptIds: string[], queueOverride?: Queue): Promise<boolean[]> {
	const results = await Promise.allSettled(promptIds.map((promptId) => removePromptJobScheduler(promptId, queueOverride)));

	return results.map((result) => (result.status === "fulfilled" ? result.value : false));
}

/**
 * Recreates a job scheduler for a prompt (removes and creates)
 * Useful when the original job is no longer available for retry
 * @param promptId - The prompt ID to recreate the scheduler for
 * @param queueOverride - Optional queue to use instead of the default environment-based queue
 */
export async function recreatePromptJobScheduler(promptId: string, queueOverride?: Queue): Promise<boolean> {
	try {
		// Remove existing scheduler if any (ignore errors if it doesn't exist)
		await removePromptJobScheduler(promptId, queueOverride);
		// Create new scheduler
		return await createPromptJobScheduler(promptId, queueOverride);
	} catch (error) {
		console.error(`Failed to recreate job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}
