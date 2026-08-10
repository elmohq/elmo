import * as Sentry from "@sentry/node";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	citations,
	type PromptExecutionContextSnapshot,
	promptExecutionRuns,
	promptRuns,
	prompts,
} from "@workspace/lib/db/schema";
import { normalizeStoredProviderPayload, validateProviderResult } from "@workspace/lib/provider-payload";
import {
	errorHasAcceptedTask,
	getProvider,
	isProviderDefinitivelyRejected,
	isProviderFatalError,
	ProviderRunRejectedError,
	ProviderTaskFailedError,
	ProviderTaskPendingError,
} from "@workspace/lib/providers";
import { providerTaskResumeBackoffMs } from "@workspace/lib/scheduler";
import type { Citation } from "@workspace/lib/text-extraction";
import { and, eq } from "drizzle-orm";
import {
	beginProviderSubmission,
	checkpointExternalTask,
	checkpointProviderRawResponse,
	checkpointProviderResult,
	deferProviderTask,
	type ExecutionRunClaim,
	failExecutionRun,
	finalizeReadyExecutions,
	getStoredProviderResult,
	heartbeatExecutionRun,
	markProviderFailure,
	markProviderSuccess,
	quarantineAmbiguousProviderCall,
	recordRawResponseValidationFailure,
	releaseProviderProbe,
	releaseRawResponseForProcessing,
	retryStoredResult,
	type StoredProviderResult,
} from "./store";

type PromptContext = PromptExecutionContextSnapshot;

async function isPromptEnabled(promptId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: prompts.id })
		.from(prompts)
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(and(eq(prompts.id, promptId), eq(prompts.enabled, true), eq(brands.enabled, true)))
		.limit(1);
	return !!row;
}

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

async function checkpointAcceptedTask(claim: ExecutionRunClaim, workerId: string, taskId: string): Promise<void> {
	const delays = [1000, 2000, 5000, 10_000];
	for (let attempt = 0; ; attempt++) {
		try {
			await checkpointExternalTask(claim.id, workerId, taskId);
			return;
		} catch (error) {
			reportRunError(claim, error, "task_checkpoint_failed");
			if (error instanceof Error && error.message.startsWith("Lost lease")) throw error;
			const delay = delays[attempt];
			if (delay === undefined) throw error;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

async function checkpointRawResponse(
	claim: ExecutionRunClaim,
	workerId: string,
	response: { rawOutput: unknown; modelVersion?: string },
): Promise<void> {
	const delays = [1000, 2000, 5000, 10_000, 30_000];
	for (let attempt = 0; ; attempt++) {
		try {
			await checkpointProviderRawResponse(claim.id, workerId, response);
			return;
		} catch (error) {
			reportRunError(claim, error, "raw_response_checkpoint_failed");
			if (error instanceof Error && error.message.startsWith("Lost lease")) throw error;
			const delay = delays[attempt];
			if (delay === undefined) throw error;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

async function executeProviderCall(claim: ExecutionRunClaim, workerId: string): Promise<void> {
	const context = claim.context;
	if (!claim.externalTaskId) {
		let enabled: boolean;
		try {
			enabled = await isPromptEnabled(claim.promptId);
		} catch (error) {
			await releaseProviderProbe(claim.circuitKey, claim.id);
			await failExecutionRun({
				runId: claim.id,
				workerId,
				kind: "internal_before_provider",
				error,
			});
			reportRunError(claim, error, "internal_before_provider");
			return;
		}
		if (!enabled) {
			await releaseProviderProbe(claim.circuitKey, claim.id);
			await failExecutionRun({
				runId: claim.id,
				workerId,
				kind: "prompt_disabled",
				error: new Error("Prompt or brand was deleted or disabled before provider submission"),
				status: "skipped",
			});
			return;
		}
	}

	let provider: ReturnType<typeof getProvider>;
	try {
		provider = getProvider(claim.provider);
	} catch (error) {
		await releaseProviderProbe(claim.circuitKey, claim.id);
		await failExecutionRun({
			runId: claim.id,
			workerId,
			kind: "internal_before_provider",
			error,
		});
		reportRunError(claim, error, "internal_before_provider");
		return;
	}

	await beginProviderSubmission(claim.id, workerId);
	let externalTaskId = claim.externalTaskId;
	let rawResponseCheckpointed = false;
	let result: StoredProviderResult;
	try {
		result = validateProviderResult(
			await provider.run(claim.model, context.prompt.value, {
				webSearch: claim.webSearchEnabled,
				version: claim.version ?? undefined,
				externalTaskId: claim.externalTaskId ?? undefined,
				idempotencyKey: claim.id,
				checkpointExternalTask: async (taskId) => {
					await checkpointAcceptedTask(claim, workerId, taskId);
					externalTaskId = taskId;
				},
				checkpointRawResponse: async (response) => {
					await checkpointRawResponse(claim, workerId, response);
					rawResponseCheckpointed = true;
				},
			}),
		);
	} catch (error) {
		if (rawResponseCheckpointed) {
			const firstFailure = await recordRawResponseValidationFailure(claim.id, workerId, error);
			if (firstFailure) {
				const circuit = await markProviderFailure({
					circuitKey: claim.circuitKey,
					runId: claim.id,
					kind: "transient",
					error,
				});
				if (circuit.state === "open") {
					console.error(
						`[scheduler] Provider route ${claim.circuitKey} circuit opened until ${circuit.reopenAt?.toISOString() ?? "manual reset"}`,
					);
				}
			}
			await releaseRawResponseForProcessing(claim.id, workerId);
			reportRunError(claim, error, "provider_normalization_failed");
			return;
		}

		if (error instanceof ProviderTaskPendingError) {
			await deferProviderTask(
				claim.id,
				workerId,
				Math.max(error.retryAfterMs, providerTaskResumeBackoffMs(claim.attemptCount)),
				error.message,
			);
			return;
		}

		if (error instanceof ProviderRunRejectedError) {
			await releaseProviderProbe(claim.circuitKey, claim.id);
			await failExecutionRun({
				runId: claim.id,
				workerId,
				kind: "provider_rejected",
				error,
			});
			reportRunError(claim, error, "provider_rejected");
			return;
		}

		if (error instanceof ProviderTaskFailedError) {
			const circuit = await markProviderFailure({
				circuitKey: claim.circuitKey,
				runId: claim.id,
				kind: "transient",
				error,
			});
			await failExecutionRun({
				runId: claim.id,
				workerId,
				kind: "provider_task_failed",
				error,
			});
			reportRunError(claim, error, "provider_task_failed");
			if (circuit.state === "open") {
				console.error(
					`[scheduler] Provider ${claim.provider} circuit opened until ${circuit.reopenAt?.toISOString() ?? "manual reset"}`,
				);
			}
			return;
		}

		const kind = isProviderFatalError(error) ? "fatal" : "transient";
		const circuit = await markProviderFailure({
			circuitKey: claim.circuitKey,
			runId: claim.id,
			kind,
			error,
		});
		if (errorHasAcceptedTask(error) && !externalTaskId) {
			await quarantineAmbiguousProviderCall(claim.id, workerId, error);
		} else if (externalTaskId) {
			await deferProviderTask(
				claim.id,
				workerId,
				providerTaskResumeBackoffMs(claim.attemptCount),
				error instanceof Error ? error.message : String(error),
			);
		} else if (kind === "fatal") {
			await failExecutionRun({ runId: claim.id, workerId, kind: "provider_fatal", error });
		} else if (isProviderDefinitivelyRejected(error)) {
			await failExecutionRun({ runId: claim.id, workerId, kind: "provider_transient", error });
		} else {
			await quarantineAmbiguousProviderCall(claim.id, workerId, error);
		}
		reportRunError(claim, error, kind === "fatal" ? "provider_fatal" : "provider_transient");
		if (circuit.state === "open") {
			console.error(
				`[scheduler] Provider ${claim.provider} circuit opened until ${circuit.reopenAt?.toISOString() ?? "manual reset"}`,
			);
		}
		return;
	}

	const checkpointDelaysMs = [1000, 2000, 5000, 10_000, 30_000];
	let checkpointed = false;
	for (let attempt = 0; attempt <= checkpointDelaysMs.length; attempt++) {
		try {
			await checkpointProviderResult(claim.id, workerId, result);
			checkpointed = true;
			break;
		} catch (error) {
			reportRunError(claim, error, "result_checkpoint_failed");
			if (error instanceof Error && error.message.startsWith("Lost lease")) break;
			const delay = checkpointDelaysMs[attempt];
			if (delay === undefined) break;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
	if (!checkpointed) return;

	try {
		await markProviderSuccess(claim.circuitKey, claim.id);
	} catch (error) {
		// The paid result is already durable; recovery can safely close a stale probe.
		reportRunError(claim, error, "provider_health_checkpoint_failed");
	}
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
				resultPayload: null,
				workerId: null,
				leaseExpiresAt: null,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(promptExecutionRuns.id, claim.id));
	});
}

async function processStoredResult(claim: ExecutionRunClaim, workerId: string): Promise<void> {
	let exists: boolean;
	let result: StoredProviderResult;
	try {
		const [promptPresent, payload] = await Promise.all([
			promptExists(claim.promptId),
			getStoredProviderResult(claim.id, workerId),
		]);
		exists = promptPresent;
		result = normalizeStoredProviderPayload(claim.provider, payload);
	} catch (error) {
		try {
			const firstFailure = await recordRawResponseValidationFailure(claim.id, workerId, error);
			if (firstFailure) {
				await markProviderFailure({
					circuitKey: claim.circuitKey,
					runId: claim.id,
					kind: "transient",
					error,
				});
			}
		} catch (healthError) {
			reportRunError(claim, healthError, "provider_health_checkpoint_failed");
		}
		await retryStoredResult(claim.id, workerId, error);
		reportRunError(claim, error, "provider_payload_invalid");
		return;
	}

	try {
		if (!exists) {
			await failExecutionRun({
				runId: claim.id,
				workerId,
				kind: "prompt_disabled",
				error: new Error("Prompt was deleted after provider work completed; result retained in execution ledger"),
				status: "skipped",
			});
			return;
		}
		await persistStoredResult(claim, workerId, claim.context, result);
	} catch (error) {
		await retryStoredResult(claim.id, workerId, error);
		reportRunError(claim, error, "internal_after_provider");
	}
}

export async function executeClaimedRun(claim: ExecutionRunClaim, workerId: string): Promise<void> {
	const heartbeatStartedAt = Date.now();
	const heartbeat = setInterval(() => {
		if (Date.now() - heartbeatStartedAt >= 30 * 60 * 1000) {
			clearInterval(heartbeat);
			return;
		}
		void heartbeatExecutionRun(claim.id, workerId).catch((error) =>
			reportRunError(claim, error, "lease_heartbeat_failed"),
		);
	}, 60_000);
	heartbeat.unref();
	try {
		if (claim.phase === "processing") {
			await processStoredResult(claim, workerId);
		} else {
			await executeProviderCall(claim, workerId);
		}
	} finally {
		clearInterval(heartbeat);
		await finalizeReadyExecutions();
	}
}
