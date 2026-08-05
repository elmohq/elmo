import {
	CLOUD_BILLING_RECONCILIATION_QUEUE,
	reconcilePendingCloudBillingMutations,
} from "@workspace/cloud/billing-control";
import { createCloudStripeClient } from "@workspace/cloud/stripe-client";
import type { Job } from "pg-boss";

export interface ReconcileCloudBillingData {
	source: "scheduled" | "manual";
}

export async function reconcileCloudBillingJob(jobs: Job<ReconcileCloudBillingData>[]): Promise<void> {
	if (process.env.DEPLOYMENT_MODE !== "cloud") return;
	const stripeClient = createCloudStripeClient();
	for (const _job of jobs) {
		const result = await reconcilePendingCloudBillingMutations({ stripeClient });
		if (result.applied + result.failed + result.pending + result.deferred > 0) {
			console.log(`[${CLOUD_BILLING_RECONCILIATION_QUEUE}]`, result);
		}
	}
}
