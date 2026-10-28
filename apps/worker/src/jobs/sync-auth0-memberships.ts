/**
 * Syncs Auth0 org memberships for all whitelabel users.
 *
 * Fetches app_metadata from the Auth0 Management API for every user
 * with a linked Auth0 account, then reconciles the member table
 * (adding new memberships and removing stale ones).
 *
 * Runs on a schedule (~every 15 minutes) as a safety net so membership
 * changes don't require users to log out and back in.
 */

import { syncAuth0User } from "@workspace/deployment/auth-hooks/whitelabel";
import { listAuth0Accounts } from "@workspace/lib/db/auth-sync";
import type { Job } from "pg-boss";

export interface SyncAuth0MembershipsData {
	source: string;
}

// Auth0 Management API rate limit is ~10 req/s on most plans
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

type Auth0Account = Awaited<ReturnType<typeof listAuth0Accounts>>[number];

/** Syncs one batch concurrently and reports how many of it landed. */
async function syncBatch(batch: Auth0Account[]): Promise<{ synced: number; failed: number }> {
	const results = await Promise.allSettled(batch.map(({ userId, accountId }) => syncAuth0User(userId, accountId)));

	let synced = 0;
	let failed = 0;
	for (const [idx, result] of results.entries()) {
		if (result.status === "fulfilled") {
			synced++;
			continue;
		}
		failed++;
		console.error(
			`[sync-auth0-memberships] Failed to sync user ${batch[idx].userId}:`,
			result.reason instanceof Error ? result.reason.message : result.reason,
		);
	}
	return { synced, failed };
}

async function syncAllAccounts(accounts: Auth0Account[]): Promise<void> {
	let synced = 0;
	let failed = 0;

	for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
		const batchTotals = await syncBatch(accounts.slice(i, i + BATCH_SIZE));
		synced += batchTotals.synced;
		failed += batchTotals.failed;

		if (i + BATCH_SIZE < accounts.length) await sleep(BATCH_DELAY_MS);
	}

	console.log(`[sync-auth0-memberships] Done: ${synced} synced, ${failed} failed`);
}

export async function syncAuth0MembershipsJob(jobs: Job<SyncAuth0MembershipsData>[]): Promise<void> {
	for (const _job of jobs) {
		const accounts = await listAuth0Accounts();
		console.log(`[sync-auth0-memberships] Syncing ${accounts.length} users`);
		await syncAllAccounts(accounts);
	}
}
