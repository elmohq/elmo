import { createHash } from "node:crypto";
import * as Sentry from "@sentry/node";
import { db } from "@workspace/lib/db/db";
import {
	citations,
	type PromptExecutionContextSnapshot,
	promptExecutionRuns,
	promptRuns,
	prompts,
	providerCallReservations,
} from "@workspace/lib/db/schema";
import { ProviderFatalError } from "@workspace/lib/providers";
import type { Citation } from "@workspace/lib/text-extraction";
import { and, eq } from "drizzle-orm";
import { ProviderAdmissionDeferredError } from "./admission";
import { runReservedProviderCall } from "./reserved-provider";
import {
	beginExecutionRun,
	deferExecutionRun,
	deferExecutionRunAfterLocalError,
	type ExecutionRunClaim,
	failExecutionRun,
	finalizeReadyExecutions,
	markExecutionRunProcessing,
	type StoredProviderResult,
} from "./store";

type PromptContext = PromptExecutionContextSnapshot;

async function promptExists(promptId: string): Promise<boolean> {
	const row = await db.query.prompts.findFirst({
		columns: { id: true },
		where: eq(prompts.id, promptId),
	});
	return !!row;
}

function extractDomainFromUrl(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

function analyzeMentions(content: string, brand: PromptContext["brand"], competitorList: PromptContext["competitors"]) {
	const contentLower = content.toLowerCase();
	const brandNames = [brand.name, ...(brand.aliases || [])].map((name) => name.toLowerCase());
	const brandDomains = [
		extractDomainFromUrl(brand.website),
		...(brand.additionalDomains || []).map(extractDomainFromUrl),
	];
	const brandMentioned =
		brandNames.some((name) => contentLower.includes(name)) ||
		brandDomains.some((domain) => contentLower.includes(domain));

	const competitorsMentioned = competitorList
		.filter((competitor) => {
			const names = [competitor.name, ...(competitor.aliases || [])].map((name) => name.toLowerCase());
			return (
				names.some((name) => contentLower.includes(name)) ||
				(competitor.domains || []).some((domain) => contentLower.includes(extractDomainFromUrl(domain)))
			);
		})
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}

function reportRunError(claim: ExecutionRunClaim, error: unknown, kind: string): void {
	Sentry.withScope((scope) => {
		scope.setTag("scheduler", "durable-prompt-runs");
		scope.setTag("provider", claim.provider);
		scope.setTag("model", claim.model);
		scope.setTag("failure_kind", kind);
		scope.setContext("run", {
			runId: claim.id,
			executionId: claim.executionId,
			promptId: claim.promptId,
			runIndex: claim.runIndex,
		});
		Sentry.captureException(error);
	});
}

function fingerprintProviderRequest(claim: ExecutionRunClaim): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				provider: claim.provider,
				model: claim.model,
				version: claim.version,
				webSearch: claim.webSearchEnabled,
				prompt: claim.context.prompt.value,
			}),
		)
		.digest("hex");
}

async function persistStoredResult(
	claim: ExecutionRunClaim,
	workerId: string,
	context: PromptContext,
	result: StoredProviderResult,
): Promise<void> {
	const safeTextContent = typeof result.textContent === "string" ? result.textContent : "";
	const { brandMentioned, competitorsMentioned } = analyzeMentions(safeTextContent, context.brand, context.competitors);
	const recordedVersion = result.modelVersion ?? claim.version ?? claim.provider;
	const completedAt = new Date();

	await db.transaction(async (tx) => {
		const [locked] = await tx
			.select({ id: promptExecutionRuns.id })
			.from(promptExecutionRuns)
			.where(
				and(
					eq(promptExecutionRuns.id, claim.id),
					eq(promptExecutionRuns.status, "processing"),
					eq(promptExecutionRuns.workerId, workerId),
				),
			)
			.for("update");
		if (!locked) throw new Error(`Lost lease while persisting run ${claim.id}`);

		const [savedRun] = await tx
			.insert(promptRuns)
			.values({
				promptId: claim.promptId,
				brandId: context.brand.id,
				model: claim.model,
				provider: claim.provider,
				version: recordedVersion,
				webSearchEnabled: claim.webSearchEnabled,
				rawOutput: result.rawOutput,
				webQueries: result.webQueries,
				brandMentioned,
				competitorsMentioned,
			})
			.returning({ id: promptRuns.id, createdAt: promptRuns.createdAt });

		if (result.citations.length > 0) {
			await tx.insert(citations).values(
				result.citations.map((citation: Citation) => ({
					promptRunId: savedRun.id,
					promptId: claim.promptId,
					brandId: context.brand.id,
					model: claim.model,
					url: citation.url,
					domain: citation.domain,
					title: citation.title || null,
					citationIndex: citation.citationIndex,
					createdAt: savedRun.createdAt,
				})),
			);
		}

		await tx
			.update(promptExecutionRuns)
			.set({
				status: "succeeded",
				promptRunId: savedRun.id,
				failureKind: null,
				errorMessage: null,
				workerId: null,
				leaseExpiresAt: null,
				completedAt,
				updatedAt: completedAt,
			})
			.where(eq(promptExecutionRuns.id, claim.id));

		await tx
			.update(providerCallReservations)
			.set({ resultPayload: null, updatedAt: completedAt })
			.where(
				and(
					eq(providerCallReservations.ownerType, "prompt-run"),
					eq(providerCallReservations.ownerId, claim.id),
					eq(providerCallReservations.workKey, "provider"),
					eq(providerCallReservations.releaseReason, "completed"),
				),
			);
	});
}

async function deferAfterLocalError(claim: ExecutionRunClaim, workerId: string, error: unknown): Promise<void> {
	try {
		await deferExecutionRunAfterLocalError(claim.id, workerId, error);
	} catch (deferError) {
		reportRunError(claim, deferError, "local_retry_checkpoint_failed");
	}
}

async function executeProviderUnit(claim: ExecutionRunClaim, workerId: string): Promise<void> {
	if (claim.phase === "provider") {
		try {
			if (!(await beginExecutionRun(claim.id, workerId))) return;
		} catch (error) {
			await deferAfterLocalError(claim, workerId, error);
			reportRunError(claim, error, "local_begin_transition_failed");
			return;
		}
	}

	let result: StoredProviderResult;
	try {
		result = await runReservedProviderCall({
			ownerType: "prompt-run",
			ownerId: claim.id,
			workKey: "provider",
			requestFingerprint: fingerprintProviderRequest(claim),
			requestMetadata: {
				executionId: claim.executionId,
				promptId: claim.promptId,
				targetIndex: claim.targetIndex,
				runIndex: claim.runIndex,
			},
			workerId: `${workerId}:prompt-run:${claim.id}`,
			config: {
				provider: claim.provider,
				model: claim.model,
				version: claim.version ?? undefined,
				webSearch: claim.webSearchEnabled,
			},
			prompt: claim.context.prompt.value,
		});
	} catch (error) {
		if (error instanceof ProviderAdmissionDeferredError) {
			await deferExecutionRun(claim.id, workerId, error.retryAt, error);
			return;
		}
		if (error instanceof ProviderFatalError) {
			await failExecutionRun({ runId: claim.id, workerId, kind: "provider_fatal", error });
			reportRunError(claim, error, "provider_fatal");
			return;
		}

		// The generic ledger may already hold a paid result when a local database
		// transition fails. Retrying the business row is always spend-safe because
		// the next claim must consult that same reservation.
		await deferAfterLocalError(claim, workerId, error);
		reportRunError(claim, error, "provider_ledger_transition_failed");
		return;
	}

	if (claim.phase === "provider") {
		try {
			await markExecutionRunProcessing(claim.id, workerId);
		} catch (error) {
			await deferAfterLocalError(claim, workerId, error);
			reportRunError(claim, error, "local_processing_transition_failed");
			return;
		}
	}

	try {
		if (!(await promptExists(claim.promptId))) {
			await failExecutionRun({
				runId: claim.id,
				workerId,
				kind: "prompt_disabled",
				error: new Error("Prompt was deleted after provider work completed; result retained in provider ledger"),
				status: "skipped",
			});
			return;
		}
		await persistStoredResult(claim, workerId, claim.context, result);
	} catch (error) {
		await deferAfterLocalError(claim, workerId, error);
		reportRunError(claim, error, "internal_after_provider");
	}
}

export async function executeClaimedRun(claim: ExecutionRunClaim, workerId: string): Promise<void> {
	try {
		await executeProviderUnit(claim, workerId);
	} finally {
		await finalizeReadyExecutions(claim.executionId);
	}
}
