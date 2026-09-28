import { createHash } from "node:crypto";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import {
	type Brand,
	citations,
	promptRunEntityMentions,
	promptRuns,
	prompts,
	sentimentAnalyses,
	sentimentAspectObservations,
	sentimentDetections,
	sentimentDispatchPermits,
	sentimentFilteredClaims,
	sentimentObservations,
	sentimentProviderAttempts,
	sentimentResolutionCases,
	usageEvents,
} from "@workspace/lib/db/schema";
import { assertCanAddPrompts, lockBrandPrompts } from "@workspace/lib/entitlements";
import { normalizeTag, SYSTEM_TAG_VALUES } from "@workspace/lib/tag-utils";
import { and, asc, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import { deletePhrase, MAX_BULK_SELECTION, MAX_DELETE_BATCH, removeTagPhrase } from "@/lib/prompt-bulk";
import type { PromptCatalogQuery } from "@/lib/prompt-catalog";
import { PublicError } from "@/lib/public-errors";
import { promptCatalogWhere } from "@/server/prompt-catalog-load";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;

/** A JS array bound as one Postgres array parameter (drizzle would otherwise spread it into a tuple). */
const uuidArray = (ids: string[]) =>
	sql`${sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	)}`;
const textArray = (ids: string[]) =>
	sql`array[${sql.join(
		ids.map((id) => sql`${id}::text`),
		sql`, `,
	)}]::text[]`;

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export interface PromptIdSelection {
	/** Ids of every prompt matching the filter, in catalog order, capped at MAX_BULK_SELECTION. */
	ids: string[];
	total: number;
}

/**
 * The exact ids behind "select all N matching": the filter's rows in catalog
 * order, ids only. A selection is what the bulk actions act on, so the browser
 * never needs the rows to hold one.
 */
export async function listPromptIds(brandId: string, query: PromptCatalogQuery): Promise<PromptIdSelection> {
	const where = promptCatalogWhere(brandId, query);
	const [total, rows] = await Promise.all([
		db.select({ n: count() }).from(prompts).where(where),
		db
			.select({ id: prompts.id })
			.from(prompts)
			.where(where)
			.orderBy(asc(prompts.value), desc(prompts.enabled), asc(prompts.id))
			.limit(MAX_BULK_SELECTION),
	]);
	return { ids: rows.map((r) => r.id), total: total[0]?.n ?? 0 };
}

/** The brand's own rows among `ids`; anything else is unknown to this brand. */
async function ownedRows(executor: Executor, brandId: string, ids: string[], forUpdate = false) {
	const query = executor
		.select({ id: prompts.id, enabled: prompts.enabled })
		.from(prompts)
		.where(and(eq(prompts.brandId, brandId), inArray(prompts.id, ids)));
	return forUpdate ? query.for("update") : query;
}

function assertAllOwned(ids: string[], owned: { id: string }[], code: string): void {
	if (owned.length !== ids.length) {
		const known = new Set(owned.map((r) => r.id));
		const missing = ids.filter((id) => !known.has(id)).length;
		throw new PublicError(
			code,
			`${missing} of the selected prompts ${missing === 1 ? "is" : "are"} not in this brand any more. Refresh the page and select again.`,
		);
	}
}

// ---------------------------------------------------------------------------
// Bulk status
// ---------------------------------------------------------------------------

export interface BulkStatusPreview {
	enabled: boolean;
	selected: number;
	alreadyInState: number;
	changing: number;
	unknown: number;
	/** Enabling: chains that will start, spread over this many hours. */
	chainsToStart: number;
	cadenceHours: number;
	/** Disabling: queued jobs that will be cancelled, and jobs already running that finish once. */
	queuedJobs: number;
	activeJobs: number;
}

async function processJobCounts(executor: Executor, promptIds: string[]) {
	if (promptIds.length === 0) return { queued: 0, active: 0 };
	const rows = await executor.execute<{ state: string; n: string }>(sql`
		select state, count(*)::text as n from pgboss.job
		where name = 'process-prompt' and state in ('created','retry','active')
		  and data->>'promptId' = any(${textArray(promptIds)})
		group by state`);
	let queued = 0;
	let active = 0;
	for (const row of rows.rows) {
		if (row.state === "active") active += Number(row.n);
		else queued += Number(row.n);
	}
	return { queued, active };
}

export async function previewBulkStatus(brand: Brand, ids: string[], enabled: boolean): Promise<BulkStatusPreview> {
	const owned = await ownedRows(db, brand.id, ids);
	const changing = owned.filter((r) => r.enabled !== enabled).map((r) => r.id);
	const jobs = enabled ? { queued: 0, active: 0 } : await processJobCounts(db, changing);
	return {
		enabled,
		selected: ids.length,
		alreadyInState: owned.length - changing.length,
		changing: changing.length,
		unknown: ids.length - owned.length,
		chainsToStart: enabled ? changing.length : 0,
		cadenceHours: brand.delayOverrideHours ?? getDefaultDelayHours(),
		queuedJobs: jobs.queued,
		activeJobs: jobs.active,
	};
}

export interface BulkStatusResult {
	changed: number;
	/** Ids that flipped to enabled and need a chain — the caller starts them after the commit. */
	enabledIds: string[];
	cancelledJobs: number;
	activeJobs: number;
}

/**
 * Flip `ids` to `enabled` in one transaction under the brand lock. Every id
 * must still belong to the brand; rows already in the target state are left
 * alone, so repeating the operation is a no-op. Disabling cancels the queued
 * chain jobs of the flipped prompts inside the same transaction — the worker's
 * own gate would skip them anyway, but a cancelled row is not a "pending job"
 * anywhere else either. A job that is already running finishes its one call.
 */
export async function commitBulkStatus(brand: Brand, ids: string[], enabled: boolean): Promise<BulkStatusResult> {
	return db.transaction(async (tx) => {
		await lockBrandPrompts(tx, brand.id);
		const owned = await ownedRows(tx, brand.id, ids, true);
		assertAllOwned(ids, owned, "bulk-status-stale");
		const changing = owned.filter((r) => r.enabled !== enabled).map((r) => r.id);
		if (changing.length === 0) return { changed: 0, enabledIds: [], cancelledJobs: 0, activeJobs: 0 };

		if (enabled) await assertCanAddPrompts(brand.organizationId, changing.length);

		await tx
			.update(prompts)
			.set({ enabled })
			.where(and(eq(prompts.brandId, brand.id), inArray(prompts.id, changing)));

		let cancelledJobs = 0;
		let activeJobs = 0;
		if (!enabled) {
			const cancelled = await tx.execute<{ n: string }>(sql`
				with cancelled as (
					update pgboss.job set state = 'cancelled', completed_on = now()
					where name = 'process-prompt' and state in ('created','retry')
					  and data->>'promptId' = any(${textArray(changing)})
					returning 1)
				select count(*)::text as n from cancelled`);
			cancelledJobs = Number(cancelled.rows[0]?.n ?? 0);
			activeJobs = (await processJobCounts(tx, changing)).active;
		}
		return { changed: changing.length, enabledIds: enabled ? changing : [], cancelledJobs, activeJobs };
	});
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export interface DeleteCounts {
	prompts: number;
	promptRuns: number;
	citations: number;
	entityMentions: number;
	sentimentDetections: number;
	sentimentAnalyses: number;
	sentimentObservations: number;
	sentimentAspectObservations: number;
	sentimentFilteredClaims: number;
	sentimentResolutionCases: number;
	sentimentDispatchPermits: number;
	sentimentProviderAttempts: number;
	sentimentAttemptCostUsd: string;
	/** Queue rows for the prompts / their runs. Pending ones block the delete; the rest are queue history. */
	promptJobsQueued: number;
	promptJobsActive: number;
	sentimentJobsPending: number;
	effectivePermits: number;
	/** Kept: billing rows referencing these prompts. */
	usageEventsKept: number;
}

export interface DeletePreview {
	selected: number;
	/** Every reason the commit would be refused right now. Empty means the delete is allowed as previewed. */
	blockers: string[];
	counts: DeleteCounts;
	/** Proof of what was previewed; commit refuses anything else. */
	digest: string;
	phrase: string;
	batchCap: number;
}

async function deleteCounts(executor: Executor, brandId: string, ids: string[]): Promise<DeleteCounts> {
	const runIds = executor.select({ id: promptRuns.id }).from(promptRuns).where(inArray(promptRuns.promptId, ids));
	const analysisIds = executor
		.select({ id: sentimentAnalyses.id })
		.from(sentimentAnalyses)
		.where(inArray(sentimentAnalyses.promptRunId, runIds));
	const observationIds = executor
		.select({ id: sentimentObservations.id })
		.from(sentimentObservations)
		.where(inArray(sentimentObservations.promptRunId, runIds));
	const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

	const [
		promptCount,
		runs,
		cites,
		mentions,
		detections,
		analyses,
		observations,
		aspects,
		claims,
		cases,
		permits,
		attempts,
		promptJobs,
		sentimentJobs,
		effectivePermits,
		usage,
	] = await Promise.all([
		n(
			executor
				.select({ n: count() })
				.from(prompts)
				.where(and(eq(prompts.brandId, brandId), inArray(prompts.id, ids))),
		),
		n(executor.select({ n: count() }).from(promptRuns).where(inArray(promptRuns.promptId, ids))),
		n(executor.select({ n: count() }).from(citations).where(inArray(citations.promptId, ids))),
		n(
			executor
				.select({ n: count() })
				.from(promptRunEntityMentions)
				.where(inArray(promptRunEntityMentions.promptRunId, runIds)),
		),
		n(
			executor.select({ n: count() }).from(sentimentDetections).where(inArray(sentimentDetections.promptRunId, runIds)),
		),
		n(executor.select({ n: count() }).from(sentimentAnalyses).where(inArray(sentimentAnalyses.promptRunId, runIds))),
		n(
			executor
				.select({ n: count() })
				.from(sentimentObservations)
				.where(inArray(sentimentObservations.promptRunId, runIds)),
		),
		n(
			executor
				.select({ n: count() })
				.from(sentimentAspectObservations)
				.where(inArray(sentimentAspectObservations.observationId, observationIds)),
		),
		n(
			executor
				.select({ n: count() })
				.from(sentimentFilteredClaims)
				.where(inArray(sentimentFilteredClaims.analysisId, analysisIds)),
		),
		n(
			executor
				.select({ n: count() })
				.from(sentimentResolutionCases)
				.where(inArray(sentimentResolutionCases.analysisId, analysisIds)),
		),
		n(
			executor
				.select({ n: count() })
				.from(sentimentDispatchPermits)
				.where(inArray(sentimentDispatchPermits.analysisId, analysisIds)),
		),
		executor
			.select({ n: count(), cost: sum(sentimentProviderAttempts.actualCostUsd) })
			.from(sentimentProviderAttempts)
			.where(inArray(sentimentProviderAttempts.analysisId, analysisIds)),
		processJobCounts(executor, ids),
		executor.execute<{ n: string }>(sql`
			select count(*)::text as n from pgboss.job
			where name = 'classify-sentiment' and state in ('created','retry','active')
			  and data->>'promptRunId' in (select id::text from prompt_runs where prompt_id in (${uuidArray(ids)}))`),
		n(
			executor
				.select({ n: count() })
				.from(sentimentDispatchPermits)
				.where(
					and(
						inArray(sentimentDispatchPermits.analysisId, analysisIds),
						inArray(sentimentDispatchPermits.state, ["issued", "active"]),
						sql`${sentimentDispatchPermits.expiresAt} > now()`,
					),
				),
		),
		n(executor.select({ n: count() }).from(usageEvents).where(inArray(usageEvents.promptId, ids))),
	]);

	return {
		prompts: promptCount,
		promptRuns: runs,
		citations: cites,
		entityMentions: mentions,
		sentimentDetections: detections,
		sentimentAnalyses: analyses,
		sentimentObservations: observations,
		sentimentAspectObservations: aspects,
		sentimentFilteredClaims: claims,
		sentimentResolutionCases: cases,
		sentimentDispatchPermits: permits,
		sentimentProviderAttempts: attempts[0]?.n ?? 0,
		sentimentAttemptCostUsd: attempts[0]?.cost ?? "0",
		promptJobsQueued: promptJobs.queued,
		promptJobsActive: promptJobs.active,
		sentimentJobsPending: Number(sentimentJobs.rows[0]?.n ?? 0),
		effectivePermits,
		usageEventsKept: usage,
	};
}

/**
 * Everything the digest covers must be stable between preview and commit for
 * the commit to be the reviewed one: the exact ids and every count of rows
 * that will be removed. Queue and permit counts are excluded — they are
 * blockers, not payload — so a job completing between preview and commit does
 * not fail a delete whose result is unchanged.
 */
function deleteDigest(brandId: string, ids: string[], counts: DeleteCounts): string {
	const {
		promptJobsQueued: _q,
		promptJobsActive: _a,
		sentimentJobsPending: _s,
		effectivePermits: _p,
		...payload
	} = counts;
	return createHash("sha256")
		.update(brandId)
		.update("\u0000")
		.update([...ids].sort().join(","))
		.update("\u0000")
		.update(JSON.stringify(payload))
		.digest("base64url");
}

function deleteBlockers(ids: string[], owned: { id: string; enabled: boolean }[], counts: DeleteCounts): string[] {
	const blockers: string[] = [];
	if (ids.length > MAX_DELETE_BATCH) {
		blockers.push(`At most ${MAX_DELETE_BATCH.toLocaleString("en-US")} prompts can be deleted in one operation.`);
	}
	const unknown = ids.length - owned.length;
	if (unknown > 0) blockers.push(`${unknown} selected prompt${unknown === 1 ? " is" : "s are"} not in this brand.`);
	const enabled = owned.filter((r) => r.enabled).length;
	if (enabled > 0)
		blockers.push(`${enabled} selected prompt${enabled === 1 ? " is" : "s are"} still enabled. Disable them first.`);
	if (counts.promptJobsActive > 0)
		blockers.push(
			`${counts.promptJobsActive} prompt job${counts.promptJobsActive === 1 ? " is" : "s are"} running right now.`,
		);
	if (counts.sentimentJobsPending > 0) {
		blockers.push(
			`${counts.sentimentJobsPending} sentiment classification${counts.sentimentJobsPending === 1 ? " is" : "s are"} still queued or running for these prompts' answers.`,
		);
	}
	if (counts.effectivePermits > 0)
		blockers.push(
			`${counts.effectivePermits} sentiment dispatch permit${counts.effectivePermits === 1 ? " is" : "s are"} still in force.`,
		);
	return blockers;
}

export async function previewDelete(brand: Brand, ids: string[]): Promise<DeletePreview> {
	const [owned, counts] = await Promise.all([ownedRows(db, brand.id, ids), deleteCounts(db, brand.id, ids)]);
	return {
		selected: ids.length,
		blockers: deleteBlockers(ids, owned, counts),
		counts,
		digest: deleteDigest(brand.id, ids, counts),
		phrase: deletePhrase(ids.length),
		batchCap: MAX_DELETE_BATCH,
	};
}

export interface DeleteResult {
	counts: DeleteCounts;
	cancelledJobs: number;
	digest: string;
}

/**
 * The reviewed delete, or nothing. Under the brand lock the selection is
 * re-read and re-counted; the digest must match the preview's and no blocker
 * may have appeared. Queued chain jobs of the prompts are cancelled in the
 * same transaction; then citations, runs (cascading to every sentiment row
 * hanging off them) and the prompts go, set-based. `usage_events` and the
 * global sentiment control log stay by design.
 */
export async function commitDelete(
	brand: Brand,
	ids: string[],
	digest: string,
	phrase: string,
	audit: { actor: string; requestId: string },
): Promise<DeleteResult> {
	if (phrase !== deletePhrase(ids.length)) {
		throw new PublicError("delete-phrase", `Type ${deletePhrase(ids.length)} exactly to confirm.`);
	}
	const result = await db.transaction(async (tx) => {
		await lockBrandPrompts(tx, brand.id);
		const owned = await ownedRows(tx, brand.id, ids, true);
		const counts = await deleteCounts(tx, brand.id, ids);
		const blockers = deleteBlockers(ids, owned, counts);
		if (blockers.length > 0) throw new PublicError("delete-blocked", blockers.join(" "));
		const current = deleteDigest(brand.id, ids, counts);
		if (current !== digest) {
			throw new PublicError(
				"delete-stale",
				"The selected prompts or their history changed since the preview. Review the delete again.",
			);
		}

		const cancelled = await tx.execute<{ n: string }>(sql`
			with cancelled as (
				update pgboss.job set state = 'cancelled', completed_on = now()
				where name = 'process-prompt' and state in ('created','retry')
				  and data->>'promptId' = any(${textArray(ids)})
				returning 1)
			select count(*)::text as n from cancelled`);

		await tx.delete(citations).where(inArray(citations.promptId, ids));
		await tx.delete(promptRuns).where(inArray(promptRuns.promptId, ids));
		const gone = await tx
			.delete(prompts)
			.where(and(eq(prompts.brandId, brand.id), inArray(prompts.id, ids)))
			.returning({ id: prompts.id });
		if (gone.length !== ids.length) {
			throw new Error(`bulk delete removed ${gone.length} of ${ids.length} prompts for brand ${brand.id}`);
		}
		return { counts, cancelledJobs: Number(cancelled.rows[0]?.n ?? 0), digest: current };
	});

	console.log(
		JSON.stringify({
			event: "prompts.bulk-delete",
			actor: audit.actor,
			requestId: audit.requestId,
			brandId: brand.id,
			selectionDigest: result.digest,
			counts: result.counts,
			cancelledJobs: result.cancelledJobs,
		}),
	);
	return result;
}

// ---------------------------------------------------------------------------
// Tag removal
// ---------------------------------------------------------------------------

export interface TagRemovalPreview {
	tag: string;
	affectedPrompts: number;
	phrase: string;
}

function normalizedUserTag(raw: string): string {
	const tag = normalizeTag(raw);
	if (!tag) throw new PublicError("tag-empty", "Choose a tag to remove.");
	if ((SYSTEM_TAG_VALUES as readonly string[]).includes(tag)) {
		throw new PublicError("tag-system", `"${tag}" is a system tag and cannot be removed.`);
	}
	return tag;
}

export async function previewTagRemoval(brandId: string, rawTag: string): Promise<TagRemovalPreview> {
	const tag = normalizedUserTag(rawTag);
	const [row] = await db
		.select({ n: count() })
		.from(prompts)
		.where(and(eq(prompts.brandId, brandId), sql`${prompts.tags} @> array[${tag}]::text[]`));
	return { tag, affectedPrompts: row?.n ?? 0, phrase: removeTagPhrase(tag) };
}

/**
 * Remove one user tag from every prompt of the brand, set-based, in one
 * transaction. Only the tag array changes: prompts, `system_tags`, runs and
 * everything below stay. A tag no prompt carries is a successful no-op.
 */
export async function commitTagRemoval(
	brandId: string,
	rawTag: string,
	phrase: string,
): Promise<{ tag: string; updated: number }> {
	const tag = normalizedUserTag(rawTag);
	if (phrase !== removeTagPhrase(tag)) {
		throw new PublicError("tag-phrase", `Type ${removeTagPhrase(tag)} exactly to confirm.`);
	}
	return db.transaction(async (tx) => {
		await lockBrandPrompts(tx, brandId);
		const rows = await tx
			.update(prompts)
			.set({ tags: sql`array_remove(${prompts.tags}, ${tag})` })
			.where(and(eq(prompts.brandId, brandId), sql`${prompts.tags} @> array[${tag}]::text[]`))
			.returning({ id: prompts.id });
		return { tag, updated: rows.length };
	});
}
