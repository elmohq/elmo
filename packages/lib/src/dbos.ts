import { WorkflowQueue } from "@dbos-inc/dbos-sdk";
import { DEFAULT_DELAY_HOURS } from "./constants";

export const promptsQueue = new WorkflowQueue("prompts-queue", {
	workerConcurrency: 5,
	rateLimit: { limitPerPeriod: 50, periodSec: 60 },
});

export const reportsQueue = new WorkflowQueue("reports-queue", {
	workerConcurrency: 2,
});

export { DEFAULT_DELAY_HOURS };
