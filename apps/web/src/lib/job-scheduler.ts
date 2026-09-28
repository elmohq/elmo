import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { ensureChainJob, PROMPT_JOB_OPTIONS, type RescheduleDeps } from "@workspace/lib/run-policy";
import { eq, inArray, sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";

export function hoursToMs(hours: number): number {
	return hours * 60 * 60 * 1000;
}

/** How many chain starts are in flight at once against pg-boss and Postgres. */
const CHAIN_START_CONCURRENCY = 50;

/**
 * Start the cadence chain of prompts that have none — just inserted, or just
 * flipped from disabled to enabled. One brand read per distinct brand rather
 * than two reads per prompt, and the sends run in bounded batches, so
 * enabling ten thousand prompts is a few hundred round trips rather than
 * thirty thousand concurrent ones.
 *
 * First runs are spread evenly over the brand's cadence when more than one
 * prompt starts together: ten thousand prompts enabled at once are ten
 * thousand paid fan-outs, and firing them in the same minute is a provider
 * rate-limit storm that then repeats on every cycle at that same minute.
 * A single prompt starts now, as before.
 *
 * Idempotent per prompt: an existing chain job is kept, never doubled.
 */
export async function scheduleFirstPromptRuns(promptIds: string[]): Promise<boolean[]> {
	if (promptIds.length === 0) return [];
	const boss = await getBoss();
	const defaultDelayHours = getDefaultDelayHours();

	const cadenceByPrompt = new Map<string, number>();
	for (let i = 0; i < promptIds.length; i += 1000) {
		const rows = await db
			.select({ id: prompts.id, delayOverrideHours: brands.delayOverrideHours })
			.from(prompts)
			.innerJoin(brands, eq(prompts.brandId, brands.id))
			.where(inArray(prompts.id, promptIds.slice(i, i + 1000)));
		for (const row of rows) cadenceByPrompt.set(row.id, row.delayOverrideHours ?? defaultDelayHours);
	}

	const deps: RescheduleDeps = {
		send: (queue, data, options) => boss.send(queue, data, options),
		listScheduledChainJobs: async (singletonKey) => {
			const rows = await db.execute(
				sql`select id from pgboss.job where name = 'process-prompt' and singleton_key = ${singletonKey} and state = 'created' order by created_on`,
			);
			return rows.rows.map((row) => String((row as { id: unknown }).id));
		},
		cancelChainJob: async (jobId) => {
			await boss.cancel("process-prompt", jobId);
		},
	};

	const results: boolean[] = new Array(promptIds.length).fill(false);
	const total = promptIds.length;
	for (let i = 0; i < total; i += CHAIN_START_CONCURRENCY) {
		const batch = promptIds.slice(i, i + CHAIN_START_CONCURRENCY);
		const settled = await Promise.allSettled(
			batch.map(async (promptId, offset) => {
				const cadenceHours = cadenceByPrompt.get(promptId);
				if (cadenceHours === undefined) return false; // deleted between commit and here
				const position = i + offset;
				const startAfterSeconds = total > 1 ? Math.floor((position / total) * cadenceHours * 3600) : 0;
				await ensureChainJob(promptId, startAfterSeconds, 0, deps);
				return true;
			}),
		);
		settled.forEach((result, offset) => {
			if (result.status === "fulfilled") results[i + offset] = result.value;
			else console.error(`Failed to start the chain for prompt ${batch[offset]}:`, result.reason);
		});
	}
	console.log(`Started ${results.filter(Boolean).length}/${total} prompt chains`);
	return results;
}

export async function getPromptCadenceHours(promptId: string): Promise<number> {
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
					...PROMPT_JOB_OPTIONS,
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
					...PROMPT_JOB_OPTIONS,
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

export async function removeMultiplePromptJobSchedulers(promptIds: string[]): Promise<boolean[]> {
	const results = await Promise.allSettled(promptIds.map((promptId) => removePromptJobScheduler(promptId)));

	return results.map((result) => (result.status === "fulfilled" ? result.value : false));
}

export async function recreatePromptJobScheduler(promptId: string, options: SchedulerOptions = {}): Promise<boolean> {
	try {
		await removePromptJobScheduler(promptId);
		return await createPromptJobScheduler(promptId, options);
	} catch (error) {
		console.error(`Failed to recreate job scheduler for prompt ${promptId}:`, error);
		return false;
	}
}

/**
 * Sends an immediate job to process a prompt (outside of the schedule).
 * Useful for manual retries from the admin UI.
 *
 * `forceDue` makes the worker run every planned target even when none is due
 * by cadence — an operator-paid run. It only bypasses the cadence gate; the
 * job itself carries the same shared PROMPT_JOB_OPTIONS as every other
 * process-prompt job (no queue retry of a paid fan-out, 90-minute ceiling).
 */
export async function sendImmediatePromptJob(promptId: string, options: { forceDue?: boolean } = {}): Promise<boolean> {
	try {
		const boss = await getBoss();
		const cadenceHours = await getPromptCadenceHours(promptId);
		const forceDue = options.forceDue === true;

		await boss.send(
			"process-prompt",
			{ promptId, cadenceHours, ...(forceDue ? { forceDue } : {}) },
			PROMPT_JOB_OPTIONS,
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
