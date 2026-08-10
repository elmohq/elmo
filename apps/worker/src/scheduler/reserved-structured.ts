import { createHash } from "node:crypto";
import { resolveResearchProvider } from "@workspace/lib/onboarding";
import {
	errorHasAcceptedTask,
	isProviderDefinitivelyRejected,
	isProviderFatalError,
	ProviderFatalError,
	ProviderTaskFailedError,
} from "@workspace/lib/providers";
import type { StructuredResearchOptions } from "@workspace/lib/providers/types";
import {
	DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT,
	getProviderMaxConcurrency,
	providerCircuitKey,
} from "@workspace/lib/scheduler";
import { structuredSchemaFingerprint } from "@workspace/lib/structured-schema";
import { ProviderAdmissionDeferredError, providerAdmissionRetryAt } from "./admission";
import {
	beginProviderCallReservation,
	checkpointProviderReservationResult,
	markProviderFailure,
	markProviderSuccess,
	recordProviderReservationError,
	releaseProviderCallReservation,
	reserveProviderCall,
} from "./store";

interface ReservedStructuredResearchInput {
	ownerType: string;
	ownerId: string;
	workKey: string;
	workerId: string;
	ownerMaxCalls: number;
	budgetScope?: "owner" | "work";
	maxAttempts?: number;
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

function hash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isCompatibleStoredRequest(
	value: unknown,
	expected: Omit<StructuredReservationMetadata, "prompt">,
): value is StructuredReservationMetadata {
	if (!value || typeof value !== "object") return false;
	const metadata = value as Partial<StructuredReservationMetadata>;
	return (
		typeof metadata.prompt === "string" &&
		metadata.kind === expected.kind &&
		metadata.provider === expected.provider &&
		metadata.model === expected.model &&
		metadata.webSearch === expected.webSearch &&
		metadata.schemaFingerprint === expected.schemaFingerprint
	);
}

/**
 * Run one paid structured request behind fleet-wide admission. Each logical
 * generation can make only a bounded number of proven-safe attempts; ambiguous
 * calls are never replaced.
 */
export async function runReservedStructuredResearch<T>(
	input: ReservedStructuredResearchInput,
	prompt: string,
	schema: StructuredResearchOptions<T>["schema"],
): Promise<T> {
	const provider = resolveResearchProvider();
	if (!provider.runStructuredResearch || !provider.structuredResearchModel) {
		throw new ProviderFatalError(`Provider ${provider.id} does not expose a durable structured-research route`);
	}
	const model = provider.structuredResearchModel;
	const circuitKey = providerCircuitKey({ provider: provider.id, model, webSearch: true });
	const schemaFingerprint = structuredSchemaFingerprint(schema);
	const routeMetadata = {
		kind: "structured-research" as const,
		provider: provider.id,
		model,
		webSearch: true as const,
		schemaFingerprint,
	};

	input.signal?.throwIfAborted();
	let effectivePrompt = prompt;
	let reservation: Awaited<ReturnType<typeof reserveProviderCall>>;
	for (let lookup = 0; ; lookup++) {
		const requestMetadata: StructuredReservationMetadata = {
			...input.requestMetadata,
			...routeMetadata,
			prompt: effectivePrompt,
		};
		reservation = await reserveProviderCall({
			provider: provider.id,
			circuitKey,
			ownerType: input.ownerType,
			ownerId: input.ownerId,
			workKey: input.workKey,
			requestFingerprint: hash(requestMetadata),
			requestMetadata,
			workerId: input.workerId,
			providerMaxConcurrency: getProviderMaxConcurrency(),
			maxAttempts: input.maxAttempts ?? DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT,
			ownerMaxCalls: input.ownerMaxCalls,
			budgetScope: input.budgetScope,
			exclusiveOwner: input.exclusiveOwner,
		});
		if (
			reservation.state === "conflict" &&
			lookup === 0 &&
			isCompatibleStoredRequest(reservation.requestMetadata, routeMetadata)
		) {
			effectivePrompt = reservation.requestMetadata.prompt;
			continue;
		}
		break;
	}

	const providerMaxConcurrency = getProviderMaxConcurrency();
	if (reservation.state === "capacity") {
		throw new ProviderAdmissionDeferredError(
			`Provider ${provider.id} is at fleet capacity`,
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
			"A prior structured request still owns this durable generation",
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
		throw new ProviderFatalError(
			`The structured request exhausted its safe attempts (${reservation.reason ?? "no reason recorded"})`,
		);
	}
	if (reservation.state === "conflict" || reservation.state === "resumed") {
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
			await recordProviderReservationError(reservation.id, input.workerId, error);
			const circuit = await markProviderFailure({ circuitKey, runId: reservation.id, kind: "transient", error });
			if (reservation.released) {
				throw new ProviderFatalError("Released structured result failed its durable schema", { cause: error });
			}
			await releaseProviderCallReservation(reservation.id, input.workerId, "invalid structured result", {
				retryAllowed: true,
			});
			throw new ProviderAdmissionDeferredError(
				"Stored structured result failed validation",
				providerAdmissionRetryAt({ reopenAt: circuit.reopenAt }),
				{ cause: error },
			);
		}
		if (!reservation.released) {
			await markProviderSuccess(circuitKey, reservation.id);
			await releaseProviderCallReservation(reservation.id, input.workerId, "result checkpoint recovered");
		}
		return cached.object;
	}

	if (input.signal?.aborted) {
		await releaseProviderCallReservation(reservation.id, input.workerId, "cancelled before provider submission", {
			retryAllowed: true,
		});
		input.signal.throwIfAborted();
	}
	await beginProviderCallReservation(reservation.id, input.workerId);

	let result: CachedStructuredResult<T>;
	let providerReturned = false;
	try {
		const providerResult = await provider.runStructuredResearch({
			prompt: effectivePrompt,
			schema,
			signal: input.signal,
		});
		providerReturned = true;
		result = {
			object: schema.parse(providerResult.object),
			...(providerResult.modelVersion ? { modelVersion: providerResult.modelVersion } : {}),
		};
	} catch (error) {
		await recordProviderReservationError(reservation.id, input.workerId, error);
		const kind = isProviderFatalError(error) ? "fatal" : "transient";
		const circuit = await markProviderFailure({ circuitKey, runId: reservation.id, kind, error });
		const knownSettled =
			providerReturned || error instanceof ProviderTaskFailedError || isProviderDefinitivelyRejected(error);
		if (knownSettled && !errorHasAcceptedTask(error)) {
			if (kind === "fatal") {
				await releaseProviderCallReservation(
					reservation.id,
					input.workerId,
					"provider definitively rejected credentials or billing",
				);
				throw error instanceof ProviderFatalError
					? error
					: new ProviderFatalError(error instanceof Error ? error.message : String(error), { cause: error });
			}
			await releaseProviderCallReservation(
				reservation.id,
				input.workerId,
				"provider definitively rejected or settled",
				{
					retryAllowed: true,
				},
			);
			throw new ProviderAdmissionDeferredError(
				"Structured provider attempt ended safely and will be retried within budget",
				providerAdmissionRetryAt({ reopenAt: circuit.reopenAt }),
				{ cause: error },
			);
		}
		throw error;
	}

	await checkpointProviderReservationResult(reservation.id, input.workerId, result);
	await markProviderSuccess(circuitKey, reservation.id);
	await releaseProviderCallReservation(reservation.id, input.workerId, "completed");
	return result.object;
}
