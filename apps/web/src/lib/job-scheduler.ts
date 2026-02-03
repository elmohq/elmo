import { DBOSClient } from "@dbos-inc/dbos-sdk";
import { db } from "@workspace/lib/db/db";
import { prompts, brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_DELAY_HOURS } from "@workspace/lib/constants";
import { promptsQueue } from "@workspace/lib/dbos";

const WORKFLOW_NAME = "processPrompt";

/**
 * Gets the delay for a prompt based on its brand's delay override or the default
 */
export async function getPromptDelayHours(promptId: string): Promise<number> {
	try {
		// Get the prompt to find its brand
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});
		
		if (!prompt) {
			console.warn(`Prompt ${promptId} not found, using default delay`);
			return DEFAULT_DELAY_HOURS;
		}
		
		// Get the brand to check for delay override
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, prompt.brandId),
		});
		
		if (!brand) {
			console.warn(`Brand ${prompt.brandId} not found, using default delay`);
			return DEFAULT_DELAY_HOURS;
		}
		
		// Use override if set, otherwise use default
		if (brand.delayOverrideHours !== null) {
			console.log(`Using custom delay for brand ${brand.name}: ${brand.delayOverrideHours}h`);
			return brand.delayOverrideHours;
		}
		
		return DEFAULT_DELAY_HOURS;
	} catch (error) {
		console.error(`Error fetching delay for prompt ${promptId}:`, error);
		return DEFAULT_DELAY_HOURS;
	}
}

let dbosClientPromise: Promise<DBOSClient> | null = null;

async function getDbosClient(): Promise<DBOSClient> {
	if (!dbosClientPromise) {
		dbosClientPromise = DBOSClient.create({
			systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
		});
	}

	return dbosClientPromise;
}

/**
 * Creates or updates a repeatable job scheduler for a prompt
 */
export async function createPromptJobScheduler(
	promptId: string,
	initialDelayHours?: number,
): Promise<boolean> {
	try {
		const dbosClient = await getDbosClient();

		const workflowOptions = {
			workflowName: WORKFLOW_NAME,
			queueName: promptsQueue.name,
			workflowID: `prompt-${promptId}-${Date.now()}`,
		};

		if (initialDelayHours === undefined || initialDelayHours === null) {
			await dbosClient.startWorkflow(workflowOptions, promptId);
		} else {
			await dbosClient.startWorkflow(workflowOptions, promptId, initialDelayHours);
		}
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
		const dbosClient = await getDbosClient();
		const workflowPrefix = `prompt-${promptId}-`;

		const workflows = await dbosClient.listWorkflows({
			workflowName: WORKFLOW_NAME,
			workflow_id_prefix: workflowPrefix,
			status: ["PENDING", "ENQUEUED"],
			limit: 1000,
		});

		await Promise.all(
			workflows.map((workflow) => dbosClient.cancelWorkflow(workflow.workflowID)),
		);
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
export async function createMultiplePromptJobSchedulers(
	promptIds: string[],
	initialDelayHours?: number,
): Promise<boolean[]> {
	const results = await Promise.allSettled(
		promptIds.map((promptId) => createPromptJobScheduler(promptId, initialDelayHours)),
	);

	return results.map((result) => (result.status === "fulfilled" ? result.value : false));
}

/**
 * Removes job schedulers for multiple prompts
 * Returns an array of results indicating success/failure for each prompt
 */
export async function removeMultiplePromptJobSchedulers(promptIds: string[]): Promise<boolean[]> {
	const results = await Promise.allSettled(promptIds.map((promptId) => removePromptJobScheduler(promptId)));

	return results.map((result) => (result.status === "fulfilled" ? result.value : false));
}

/**
 * Recreates a job scheduler for a prompt (removes and creates)
 * Useful when the original job is no longer available for retry
 */
export async function recreatePromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		// Remove existing scheduler if any (ignore errors if it doesn't exist)
		await removePromptJobScheduler(promptId);
		// Create new scheduler
		return await createPromptJobScheduler(promptId);
	} catch (error) {
		console.error(`Failed to recreate job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}
