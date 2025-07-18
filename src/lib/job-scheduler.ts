import { promptQueue } from "@/worker/queues";

/**
 * Creates or updates a repeatable job scheduler for a prompt
 * This will schedule the prompt to run every 60 seconds
 */
export async function createPromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		await promptQueue.upsertJobScheduler(
			`repeater-${promptId}`,
			{
				every: 24 * 60 * 60 * 1000, // every day
			},
			{
				name: `prompt-${promptId}`, // Unique job name per prompt
				data: { promptId },
				opts: {
					attempts: 3,
					backoff: {
						type: 'exponential',
						delay: 2000,
					},
					removeOnComplete: 5000,
					removeOnFail: 5000,
				},
			}
		);
		return true;
	} catch (error) {
		console.error(`Failed to create job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Removes a repeatable job scheduler for a prompt
 */
export async function removePromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		await promptQueue.removeJobScheduler(`repeater-${promptId}`);
		return true;
	} catch (error) {
		console.error(`Failed to remove job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Creates job schedulers for multiple prompts
 * Returns an array of results indicating success/failure for each prompt
 */
export async function createMultiplePromptJobSchedulers(promptIds: string[]): Promise<boolean[]> {
	const results = await Promise.allSettled(
		promptIds.map(promptId => createPromptJobScheduler(promptId))
	);
	
	return results.map(result => 
		result.status === 'fulfilled' ? result.value : false
	);
}

/**
 * Removes job schedulers for multiple prompts
 * Returns an array of results indicating success/failure for each prompt
 */
export async function removeMultiplePromptJobSchedulers(promptIds: string[]): Promise<boolean[]> {
	const results = await Promise.allSettled(
		promptIds.map(promptId => removePromptJobScheduler(promptId))
	);
	
	return results.map(result => 
		result.status === 'fulfilled' ? result.value : false
	);
} 