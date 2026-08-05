import {
	CLOUD_BILLING_RECONCILIATION_QUEUE,
	reconcilePendingCloudBillingMutations,
} from "@workspace/cloud/billing-control";
import { createCloudStripeClient } from "@workspace/cloud/stripe-client";
import { reconcileAuthoritativeCloudSubscriptions } from "@workspace/cloud/subscription-reconciliation";
import type { Job } from "pg-boss";

export interface ReconcileCloudBillingData {
	source: "scheduled" | "manual";
}

export async function reconcileCloudBillingJob(jobs: Job<ReconcileCloudBillingData>[]): Promise<void> {
	if (process.env.DEPLOYMENT_MODE !== "cloud") return;
	const stripeClient = createCloudStripeClient();
	for (const _job of jobs) {
		// Reconcile commands first so the authoritative customer scan cannot
		// project a pre-mutation Stripe snapshot after the command succeeds.
		let mutations: Awaited<ReturnType<typeof reconcilePendingCloudBillingMutations>> | undefined;
		let subscriptions: Awaited<ReturnType<typeof reconcileAuthoritativeCloudSubscriptions>> | undefined;
		const errors: unknown[] = [];
		try {
			mutations = await reconcilePendingCloudBillingMutations({ stripeClient });
		} catch (error) {
			errors.push(error);
		}
		try {
			subscriptions = await reconcileAuthoritativeCloudSubscriptions({ stripeClient });
		} catch (error) {
			errors.push(error);
		}
		if (
			(mutations && mutations.applied + mutations.failed + mutations.pending + mutations.deferred > 0) ||
			(subscriptions && subscriptions.reconciled > 0)
		) {
			console.log(`[${CLOUD_BILLING_RECONCILIATION_QUEUE}]`, { mutations, subscriptions });
		}
		if (errors.length > 0) {
			throw new AggregateError(errors, `${errors.length} cloud billing reconciliation phase(s) failed`);
		}
	}
}
