import { randomUUID } from "node:crypto";
import { normalizeStoredProviderPayload, validateProviderResult } from "@workspace/lib/provider-payload";
import {
	errorHasAcceptedTask,
	getProvider,
	isProviderDefinitivelyRejected,
	isProviderFatalError,
	type ModelConfig,
	ProviderFatalError,
	ProviderRunRejectedError,
	ProviderTaskFailedError,
	ProviderTaskPendingError,
} from "@workspace/lib/providers";
import { getProviderMaxConcurrency, providerCircuitKey, providerTaskResumeBackoffMs } from "@workspace/lib/scheduler";
import { ProviderAdmissionDeferredError, providerAdmissionRetryAt } from "./admission";
import {
	beginProviderCallReservation,
	checkpointProviderReservationResult,
	checkpointProviderReservationTask,
	completeProviderCallReservation,
	deferFailedProviderTaskReservation,
	deferProviderCallReservation,
	quarantineProviderCallReservation,
	reserveProviderCall,
	type StoredProviderPayload,
	type StoredProviderResult,
	settleProviderCallFailure,
	yieldPreparedProviderCallReservation,
} from "./store";

export interface ReservedProviderCallInput {
	ownerType: string;
	ownerId: string;
	workKey: string;
	requestFingerprint: string;
	requestMetadata: unknown;
	workerId: string;
	config: ModelConfig;
	prompt: string;
	ownerMaxCalls?: number;
	exclusiveOwner?: boolean;
	signal?: AbortSignal;
}

/** Every acquisition gets an exclusive token, even inside one worker process. */
export function providerLeaseToken(workerId: string): string {
	return `${workerId}:provider-lease:${randomUUID()}`;
}

export async function retryProviderCheckpoint(write: () => Promise<void>): Promise<void> {
	const delays = [1000, 2000, 5000, 10_000, 30_000];
	for (let attempt = 0; ; attempt++) {
		try {
			await write();
			return;
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Lost provider reservation")) throw error;
			const delay = delays[attempt];
			if (delay === undefined) throw error;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

/**
 * Execute one logical provider unit through the sole paid-call state machine.
 * A reservation can cross the submission boundary once; every later claim
 * either resumes that provider task, consumes its stored result, or fails
 * closed without purchasing a replacement.
 */
export async function runReservedProviderCall(input: ReservedProviderCallInput): Promise<StoredProviderResult> {
	input.signal?.throwIfAborted();
	const circuitKey = providerCircuitKey({
		provider: input.config.provider,
		model: input.config.model,
		version: input.config.version,
		webSearch: input.config.webSearch,
	});
	const leaseToken = providerLeaseToken(input.workerId);
	const providerMaxConcurrency = getProviderMaxConcurrency();
	const reservation = await reserveProviderCall({
		provider: input.config.provider,
		circuitKey,
		ownerType: input.ownerType,
		ownerId: input.ownerId,
		workKey: input.workKey,
		requestFingerprint: input.requestFingerprint,
		requestMetadata: input.requestMetadata,
		workerId: leaseToken,
		providerMaxConcurrency,
		ownerMaxCalls: input.ownerMaxCalls,
		exclusiveOwner: input.exclusiveOwner,
	});

	if (reservation.state === "capacity") {
		throw new ProviderAdmissionDeferredError(
			`Provider ${input.config.provider} is at fleet capacity`,
			providerAdmissionRetryAt({ providerMaxConcurrency }),
		);
	}
	if (reservation.state === "circuit") {
		throw new ProviderAdmissionDeferredError(
			`Provider route ${circuitKey} circuit is open`,
			providerAdmissionRetryAt({ reopenAt: reservation.reopenAt }),
		);
	}
	if (reservation.state === "busy") {
		throw new ProviderAdmissionDeferredError(
			`Provider unit ${input.workKey} is leased by another claim`,
			providerAdmissionRetryAt({ retryAt: reservation.retryAt }),
		);
	}
	if (reservation.state === "budget") {
		throw new ProviderFatalError(`Provider owner exhausted its hard call budget of ${reservation.limit}`);
	}
	if (reservation.state === "ambiguous") {
		throw new ProviderFatalError(
			`Provider unit ${input.workKey} may already have been accepted; refusing to purchase it again`,
		);
	}
	if (reservation.state === "terminal") {
		throw new ProviderFatalError(
			`Provider unit ${input.workKey} is terminal (${reservation.reason ?? "no reason recorded"})`,
		);
	}
	if (reservation.state === "conflict") {
		throw new ProviderFatalError(`Provider unit ${input.workKey} changed after it was materialized`);
	}

	if (reservation.state === "cached") {
		let result: StoredProviderResult;
		try {
			result = normalizeStoredProviderPayload(input.config.provider, reservation.result as StoredProviderPayload);
		} catch (error) {
			if (!reservation.released) {
				await settleProviderCallFailure({
					id: reservation.id,
					workerId: leaseToken,
					circuitKey,
					kind: "transient",
					error,
					reason: "stored provider response failed validation",
				});
			}
			throw new ProviderFatalError("Stored provider response failed validation; refusing to purchase it again", {
				cause: error,
			});
		}
		if (!reservation.released) {
			await completeProviderCallReservation({ id: reservation.id, workerId: leaseToken, circuitKey, result });
		}
		return result;
	}

	if (input.signal?.aborted) {
		if (reservation.externalTaskId) {
			await deferProviderCallReservation(reservation.id, leaseToken, input.signal.reason);
		} else {
			await yieldPreparedProviderCallReservation(reservation.id, leaseToken, "cancelled before provider submission");
		}
		input.signal.throwIfAborted();
	}

	let provider: ReturnType<typeof getProvider> | null = null;
	let providerUnavailableCause: unknown;
	try {
		provider = getProvider(input.config.provider);
		if (!provider.isConfigured()) provider = null;
	} catch (error) {
		providerUnavailableCause = error;
		provider = null;
	}
	if (!provider) {
		const error = new Error(`Provider ${input.config.provider} credentials or route are unavailable`, {
			cause: providerUnavailableCause,
		});
		if (reservation.externalTaskId) {
			await deferProviderCallReservation(reservation.id, leaseToken, error);
		} else {
			await yieldPreparedProviderCallReservation(reservation.id, leaseToken, error.message);
		}
		throw new ProviderAdmissionDeferredError(error.message, providerAdmissionRetryAt({ providerMaxConcurrency: 0 }), {
			cause: error,
		});
	}
	await beginProviderCallReservation(reservation.id, leaseToken);

	let externalTaskId = reservation.externalTaskId ?? undefined;
	let rawCheckpoint: StoredProviderPayload | null = null;
	let providerReturned = false;
	let result: StoredProviderResult;
	try {
		const providerResult = await provider.run(input.config.model, input.prompt, {
			webSearch: input.config.webSearch,
			version: input.config.version,
			idempotencyKey: reservation.id,
			externalTaskId,
			checkpointExternalTask: async (taskId) => {
				await retryProviderCheckpoint(() => checkpointProviderReservationTask(reservation.id, leaseToken, taskId));
				externalTaskId = taskId;
			},
			checkpointRawResponse: async (response) => {
				const payload: StoredProviderPayload = { rawResponseOnly: true, ...response };
				await retryProviderCheckpoint(() => checkpointProviderReservationResult(reservation.id, leaseToken, payload));
				rawCheckpoint = payload;
			},
		});
		providerReturned = true;
		result = validateProviderResult(providerResult);
	} catch (error) {
		// The raw paid response is already durable. Recover it through the same
		// decoder used after a worker restart before declaring the output unusable.
		if (rawCheckpoint) {
			try {
				result = normalizeStoredProviderPayload(input.config.provider, rawCheckpoint);
			} catch (normalizationError) {
				await settleProviderCallFailure({
					id: reservation.id,
					workerId: leaseToken,
					circuitKey,
					kind: "transient",
					error: normalizationError,
					reason: "provider response settled without usable output",
				});
				throw new ProviderFatalError("A paid provider response failed validation; refusing to purchase a replacement", {
					cause: normalizationError,
				});
			}
			await completeProviderCallReservation({ id: reservation.id, workerId: leaseToken, circuitKey, result });
			return result;
		}

		if (error instanceof ProviderTaskPendingError && externalTaskId) {
			await deferProviderCallReservation(reservation.id, leaseToken, error);
			throw new ProviderAdmissionDeferredError(
				"Accepted provider task is still pending",
				providerAdmissionRetryAt({
					retryAt: new Date(
						Date.now() + Math.max(error.retryAfterMs, providerTaskResumeBackoffMs(reservation.attemptCount)),
					),
				}),
				{ cause: error },
			);
		}
		if (error instanceof ProviderRunRejectedError) {
			await settleProviderCallFailure({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey,
				kind: "local",
				error,
				reason: "provider rejected request",
			});
			throw new ProviderFatalError(error.message, { cause: error });
		}

		const kind = isProviderFatalError(error) ? "fatal" : "transient";
		if (providerReturned || error instanceof ProviderTaskFailedError) {
			await settleProviderCallFailure({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey,
				kind,
				error,
				reason: "provider task settled without usable output",
			});
			throw new ProviderFatalError("Provider task settled without usable output", { cause: error });
		}
		if (externalTaskId) {
			await deferFailedProviderTaskReservation({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey,
				kind,
				error,
			});
			throw new ProviderAdmissionDeferredError(
				"Accepted provider task will be resumed from its durable provider id",
				providerAdmissionRetryAt({
					retryAt: new Date(Date.now() + providerTaskResumeBackoffMs(reservation.attemptCount)),
				}),
				{ cause: error },
			);
		}
		if (isProviderDefinitivelyRejected(error) && !errorHasAcceptedTask(error)) {
			await settleProviderCallFailure({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey,
				kind,
				error,
				reason:
					kind === "fatal"
						? "provider definitively rejected credentials or billing"
						: "provider definitively rejected request",
			});
			throw error instanceof ProviderFatalError
				? error
				: new ProviderFatalError(error instanceof Error ? error.message : String(error), { cause: error });
		}

		await quarantineProviderCallReservation({
			id: reservation.id,
			workerId: leaseToken,
			circuitKey,
			kind,
			error,
		});
		throw new ProviderFatalError(
			"Provider submission may have been accepted; refusing to purchase or retry this logical unit",
			{ cause: error },
		);
	}

	// Completion is a database transition, not a provider outcome. Its failure
	// must never be reclassified as a provider/output failure.
	await completeProviderCallReservation({ id: reservation.id, workerId: leaseToken, circuitKey, result });
	return result;
}
