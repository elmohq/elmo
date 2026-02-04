import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
import { PROMPTS_QUEUE_NAME, REPORTS_QUEUE_NAME } from "@workspace/lib/dbos";

/**
 * Prompts Queue Configuration
 *
 * CURRENT STATE (during migration):
 * - workerConcurrency is set very high (5000) because ~4000 workflows have
 *   initialDelayHours and call DBOS.sleep(). Sleeping workflows count against
 *   concurrency but don't consume CPU.
 * - No rateLimit so workflows can start quickly and enter sleep state.
 * - Actual API calls are limited by a semaphore in ai-providers.ts (max 10 concurrent).
 *   This is safe because the semaphore is INSIDE the DBOS step, not affecting step order.
 *
 * TODO(post-migration): Once initialDelayHours is removed from all workflows:
 * 1. Reduce workerConcurrency to 10-20 (this will naturally limit API calls)
 * 2. Optionally add rateLimit back: { limitPerPeriod: 50, periodSec: 60 }
 * 3. Remove or increase the semaphore limit in ai-providers.ts
 *
 * Post-migration, workflows will:
 * - Run immediately when started (no internal sleep)
 * - Complete and schedule next run as a NEW workflow with delay
 * - workerConcurrency will directly limit concurrent API calls
 */
export const promptsQueue = new WorkflowQueue(PROMPTS_QUEUE_NAME, {
	workerConcurrency: 5000,
});

export const reportsQueue = new WorkflowQueue(REPORTS_QUEUE_NAME, {
	workerConcurrency: 2,
});
