import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
import { PROMPTS_QUEUE_NAME, REPORTS_QUEUE_NAME } from "@workspace/lib/dbos";

// Note: workerConcurrency is set very high because we migrated ~4000 workflows
// that have initialDelayHours and call DBOS.sleep(). While sleeping, workflows
// are "active" (count against concurrency) but don't consume CPU - they're
// persisted in the database. The rateLimit controls actual API throughput.
// TODO(post-migration): Once initialDelayHours is removed and workflows
// schedule their next run at completion time (not sleep internally),
// this can be reduced to a lower number like 10-20.
export const promptsQueue = new WorkflowQueue(PROMPTS_QUEUE_NAME, {
	workerConcurrency: 5000,
	rateLimit: { limitPerPeriod: 50, periodSec: 60 },
});

export const reportsQueue = new WorkflowQueue(REPORTS_QUEUE_NAME, {
	workerConcurrency: 2,
});
