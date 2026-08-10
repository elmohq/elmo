import { createHash } from "node:crypto";
import { resolveResearchProvider } from "@workspace/lib/onboarding";
import {
	errorHasAcceptedTask,
	getProvider,
	isProviderDefinitivelyRejected,
	isProviderFatalError,
	ProviderFatalError,
	ProviderTaskFailedError,
} from "@workspace/lib/providers";
import type { StructuredResearchOptions, StructuredResearchResult } from "@workspace/lib/providers/types";
import { getProviderMaxConcurrency, providerCircuitKey } from "@workspace/lib/scheduler";
import { structuredSchemaFingerprint } from "@workspace/lib/structured-schema";
import { ProviderAdmissionDeferredError, providerAdmissionRetryAt } from "./admission";
import { providerLeaseToken, retryProviderCheckpoint } from "./reserved-provider";
import {
	beginProviderCallReservation,
	checkpointProviderReservationResult,
	completeProviderCallReservation,
	getProviderCallReservationIdentity,
	type ProviderReservationIdentity,
	quarantineProviderCallReservation,
	reserveProviderCall,
	settleProviderCallFailure,
	yieldPreparedProviderCallReservation,
} from "./store";

interface ReservedStructuredResearchInput {
	ownerType: string;
	ownerId: string;
	workKey: string;
	workerId: string;
	ownerMaxCalls?: number;
	exclusiveOwner?: boolean;
	requestMetadata?: Record<string, unknown>;
	signal?: AbortSignal;
}

interface CachedStructuredResult<T> {
	object: T;
	modelVersion?: string;
}

interface StructuredReservationMetadata extends Record<string, unknown> {
	prompt: string;
	kind: "structured-research";
	provider: string;
	model: string;
	webSearch: true;
	schemaFingerprint: string;
}

interface StructuredReservationRoute {
	provider: string;
	model: string;
	circuitKey: string;
	requestFingerprint: string;
	requestMetadata: StructuredReservationMetadata;
	prompt: string;
}

function hash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isStoredStructuredRequest(value: unknown, schemaFingerprint: string): value is StructuredReservationMetadata {
	if (!value || typeof value !== "object") return false;
	const metadata = value as Partial<StructuredReservationMetadata>;
	return (
		typeof metadata.prompt === "string" &&
		metadata.kind === "structured-research" &&
		typeof metadata.provider === "string" &&
		typeof metadata.model === "string" &&
		metadata.webSearch === true &&
		metadata.schemaFingerprint === schemaFingerprint
	);
}

function routeFromStoredIdentity(
	identity: ProviderReservationIdentity,
	schemaFingerprint: string,
): StructuredReservationRoute {
	if (!isStoredStructuredRequest(identity.requestMetadata, schemaFingerprint)) {
		throw new ProviderFatalError("The stored structured request has an incompatible output contract");
	}
	const metadata = identity.requestMetadata;
	if (identity.provider !== metadata.provider) {
		throw new ProviderFatalError("The stored structured request has an invalid provider route");
	}
	return {
		provider: metadata.provider,
		model: metadata.model,
		circuitKey: identity.circuitKey,
		requestFingerprint: identity.requestFingerprint,
		requestMetadata: metadata,
		prompt: metadata.prompt,
	};
}

function routeForNewRequest(
	input: ReservedStructuredResearchInput,
	prompt: string,
	schemaFingerprint: string,
): StructuredReservationRoute {
	const provider = resolveResearchProvider();
	if (!provider.runStructuredResearch || !provider.structuredResearchModel) {
		throw new ProviderFatalError(`Provider ${provider.id} does not expose a durable structured-research route`);
	}
	const model = provider.structuredResearchModel;
	const requestMetadata: StructuredReservationMetadata = {
		...input.requestMetadata,
		kind: "structured-research",
		provider: provider.id,
		model,
		webSearch: true,
		schemaFingerprint,
		prompt,
	};
	return {
		provider: provider.id,
		model,
		circuitKey: providerCircuitKey({ provider: provider.id, model, webSearch: true }),
		requestFingerprint: hash(requestMetadata),
		requestMetadata,
		prompt,
	};
}

/**
 * Run one paid structured request behind fleet-wide admission. Each logical
 * unit gets one durable reservation; failures and ambiguous calls are never
 * replaced automatically.
 */
export async function runReservedStructuredResearch<T>(
	input: ReservedStructuredResearchInput,
	prompt: string,
	schema: StructuredResearchOptions<T>["schema"],
): Promise<T> {
	const schemaFingerprint = structuredSchemaFingerprint(schema);
	const leaseToken = providerLeaseToken(input.workerId);
	const providerMaxConcurrency = getProviderMaxConcurrency();

	input.signal?.throwIfAborted();
	let identity = await getProviderCallReservationIdentity(input);
	let route: StructuredReservationRoute;
	let reservation: Awaited<ReturnType<typeof reserveProviderCall>>;
	for (let lookup = 0; ; lookup++) {
		route = identity
			? routeFromStoredIdentity(identity, schemaFingerprint)
			: routeForNewRequest(input, prompt, schemaFingerprint);
		reservation = await reserveProviderCall({
			provider: route.provider,
			circuitKey: route.circuitKey,
			ownerType: input.ownerType,
			ownerId: input.ownerId,
			workKey: input.workKey,
			requestFingerprint: route.requestFingerprint,
			requestMetadata: route.requestMetadata,
			workerId: leaseToken,
			providerMaxConcurrency,
			ownerMaxCalls: input.ownerMaxCalls,
			exclusiveOwner: input.exclusiveOwner,
		});
		if (reservation.state === "conflict" && !identity && lookup === 0) {
			identity = await getProviderCallReservationIdentity(input);
			if (!identity) break;
			continue;
		}
		break;
	}

	if (reservation.state === "capacity") {
		throw new ProviderAdmissionDeferredError(
			`Provider ${route.provider} is at fleet capacity`,
			providerAdmissionRetryAt({ providerMaxConcurrency }),
		);
	}
	if (reservation.state === "circuit") {
		throw new ProviderAdmissionDeferredError(
			`Provider route ${route.circuitKey} circuit is open`,
			providerAdmissionRetryAt({ reopenAt: reservation.reopenAt }),
		);
	}
	if (reservation.state === "busy") {
		throw new ProviderAdmissionDeferredError(
			"A prior structured request still owns this durable unit",
			providerAdmissionRetryAt({ retryAt: reservation.retryAt }),
		);
	}
	if (reservation.state === "budget") {
		throw new ProviderFatalError(`Structured research exhausted its hard provider-call budget of ${reservation.limit}`);
	}
	if (reservation.state === "ambiguous") {
		throw new ProviderFatalError("A prior structured request may have been accepted; refusing to purchase it again");
	}
	if (reservation.state === "terminal") {
		throw new ProviderFatalError(`The structured request is terminal (${reservation.reason ?? "no reason recorded"})`);
	}
	if (reservation.state === "conflict" || (reservation.state === "ready" && reservation.externalTaskId)) {
		throw new ProviderFatalError("The structured request does not match its durable reservation");
	}

	if (reservation.state === "cached") {
		let cached: CachedStructuredResult<T>;
		try {
			const value = reservation.result as CachedStructuredResult<unknown>;
			cached = {
				object: schema.parse(value?.object),
				...(typeof value?.modelVersion === "string" ? { modelVersion: value.modelVersion } : {}),
			};
		} catch (error) {
			if (reservation.released) {
				throw new ProviderFatalError("Released structured result failed its durable schema", { cause: error });
			}
			await settleProviderCallFailure({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey: route.circuitKey,
				kind: "transient",
				error,
				reason: "invalid structured result",
			});
			throw new ProviderFatalError("Stored structured result failed validation; refusing to purchase it again", {
				cause: error,
			});
		}
		if (!reservation.released) {
			await completeProviderCallReservation({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey: route.circuitKey,
				result: cached,
			});
		}
		return cached.object;
	}

	if (input.signal?.aborted) {
		await yieldPreparedProviderCallReservation(reservation.id, leaseToken, "cancelled before provider submission");
		input.signal.throwIfAborted();
	}

	let provider: ReturnType<typeof getProvider>;
	try {
		provider = getProvider(route.provider);
	} catch (error) {
		await yieldPreparedProviderCallReservation(
			reservation.id,
			leaseToken,
			"stored structured provider route is unavailable",
		);
		throw new ProviderAdmissionDeferredError(
			`Stored structured provider ${route.provider} is unavailable`,
			providerAdmissionRetryAt({ providerMaxConcurrency: 0 }),
			{ cause: error },
		);
	}
	if (!provider.runStructuredResearch || provider.structuredResearchModel !== route.model) {
		const error = new Error(`Provider ${route.provider} no longer exposes structured model ${route.model}`);
		await yieldPreparedProviderCallReservation(
			reservation.id,
			leaseToken,
			"stored structured provider route is unavailable",
		);
		throw new ProviderAdmissionDeferredError(error.message, providerAdmissionRetryAt({ providerMaxConcurrency: 0 }), {
			cause: error,
		});
	}
	let configured = false;
	try {
		configured = provider.isConfigured();
	} catch {
		// Credential lookup can fail transiently without crossing the paid boundary.
	}
	if (!configured) {
		await yieldPreparedProviderCallReservation(
			reservation.id,
			leaseToken,
			"stored structured provider credentials are unavailable",
		);
		throw new ProviderAdmissionDeferredError(
			`Provider ${route.provider} credentials are unavailable`,
			providerAdmissionRetryAt({ providerMaxConcurrency: 0 }),
		);
	}
	await beginProviderCallReservation(reservation.id, leaseToken);

	const completeCheckpointedResult = async (checkpointed: CachedStructuredResult<T>): Promise<T> => {
		let result: CachedStructuredResult<T>;
		try {
			result = {
				object: schema.parse(checkpointed.object),
				...(checkpointed.modelVersion ? { modelVersion: checkpointed.modelVersion } : {}),
			};
		} catch (error) {
			await settleProviderCallFailure({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey: route.circuitKey,
				kind: "transient",
				error,
				reason: "structured provider response failed validation",
			});
			throw new ProviderFatalError("A paid structured response failed validation; refusing to purchase a replacement", {
				cause: error,
			});
		}
		await completeProviderCallReservation({
			id: reservation.id,
			workerId: leaseToken,
			circuitKey: route.circuitKey,
			result,
		});
		return result.object;
	};

	let checkpointedResult: CachedStructuredResult<T> | null = null;
	let checkpointFailed = false;
	let providerResult: StructuredResearchResult<T>;
	try {
		providerResult = await provider.runStructuredResearch({
			prompt: route.prompt,
			schema,
			signal: input.signal,
			checkpointResult: async (value) => {
				const durableResult: CachedStructuredResult<T> = {
					object: value.object,
					...(value.modelVersion ? { modelVersion: value.modelVersion } : {}),
				};
				try {
					await retryProviderCheckpoint(() =>
						checkpointProviderReservationResult(reservation.id, leaseToken, durableResult),
					);
				} catch (error) {
					checkpointFailed = true;
					throw error;
				}
				checkpointedResult = durableResult;
			},
		});
	} catch (error) {
		if (checkpointFailed) throw error;
		if (checkpointedResult) return completeCheckpointedResult(checkpointedResult);
		const kind = isProviderFatalError(error) ? "fatal" : "transient";
		if (error instanceof ProviderTaskFailedError) {
			await settleProviderCallFailure({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey: route.circuitKey,
				kind,
				error,
				reason: "structured provider work settled without usable output",
			});
			throw new ProviderFatalError("Structured provider work settled without usable output", { cause: error });
		}
		if (isProviderDefinitivelyRejected(error) && !errorHasAcceptedTask(error)) {
			await settleProviderCallFailure({
				id: reservation.id,
				workerId: leaseToken,
				circuitKey: route.circuitKey,
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
			circuitKey: route.circuitKey,
			kind,
			error,
		});
		throw new ProviderFatalError(
			"Structured provider submission may have been accepted; refusing to retry this logical unit",
			{ cause: error },
		);
	}

	// Every scheduler-aware adapter checkpoints before returning. Keep the
	// fallback for custom providers so a future adapter omission stays safe.
	if (!checkpointedResult) {
		checkpointedResult = {
			object: providerResult.object,
			...(providerResult.modelVersion ? { modelVersion: providerResult.modelVersion } : {}),
		};
		await retryProviderCheckpoint(() =>
			checkpointProviderReservationResult(reservation.id, leaseToken, checkpointedResult),
		);
	}

	return completeCheckpointedResult(checkpointedResult);
}
