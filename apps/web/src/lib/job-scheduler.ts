import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import {
	PROCESS_PROMPT_QUEUE,
	PROMPT_JOB_OPTIONS,
	PROMPT_SINGLETON_SECONDS,
	promptSingletonKey,
} from "@workspace/lib/queues/prompt-jobs";
import { GENERATE_REPORT_QUEUE, REPORT_JOB_OPTIONS } from "@workspace/lib/queues/report-jobs";
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

// Only the first job is queued here; each cycle in the worker queues its successor.
type SchedulerOptions = {
	sendImmediate?: boolean;
};

export async function createPromptJobScheduler(promptId: string, options: SchedulerOptions = {}): Promise<boolean> {
	try {
		const boss = await getBoss();
		const sendImmediate = options.sendImmediate ?? true;
		const startAfterSeconds = sendImmediate ? 0 : (await getPromptCadenceHours(promptId)) * 60 * 60;

		await boss.send(
			PROCESS_PROMPT_QUEUE,
			{ promptId },
			{
				singletonKey: promptSingletonKey(promptId),
				singletonSeconds: startAfterSeconds || PROMPT_SINGLETON_SECONDS,
				...(startAfterSeconds ? { startAfter: startAfterSeconds } : {}),
				...PROMPT_JOB_OPTIONS,
			},
		);

		console.log(`Created job for prompt ${promptId}${sendImmediate ? "" : ` in ${startAfterSeconds / 3600}h`}`);
		return true;
	} catch (error) {
		console.error(`Failed to create job for prompt ${promptId}:`, error);
		return false;
	}
}

export async function removePromptJobScheduler(promptId: string): Promise<boolean> {
	try {
		const boss = await getBoss();
		// The pending job is left alone; the worker skips a disabled prompt without spending anything.
		try {
			await boss.unschedule(PROCESS_PROMPT_QUEUE, promptId);
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
 * Sends an immediate job to process a prompt (outside of the schedule).
 * Useful for manual retries from the admin UI. Skips the singleton key so it runs even mid-cadence.
 */
export async function sendImmediatePromptJob(promptId: string): Promise<boolean> {
	try {
		const boss = await getBoss();
		await boss.send(PROCESS_PROMPT_QUEUE, { promptId }, PROMPT_JOB_OPTIONS);
		console.log(`Sent immediate job for prompt ${promptId}`);
		return true;
	} catch (error) {
		console.error(`Failed to send immediate job for prompt ${promptId}:`, error);
		return false;
	}
}

export async function sendReportJob(data: {
	reportId: string;
	brandName: string;
	brandAliases: string[];
	brandWebsite: string;
	manualPrompts?: string[];
}): Promise<boolean> {
	const { reportId } = data;
	try {
		const boss = await getBoss();

		await boss.send(GENERATE_REPORT_QUEUE, data, REPORT_JOB_OPTIONS);

		console.log(`Sent report job for report ${reportId}`);
		return true;
	} catch (error) {
		console.error(`Failed to send report job for report ${reportId}:`, error);
		return false;
	}
}
