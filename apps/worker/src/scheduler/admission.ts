/**
 * Paid work could not be admitted yet. Job handlers catch this and create one
 * future-dated successor, so backpressure consumes neither an active worker
 * slot nor pg-boss's finite error retry budget.
 */
export class ProviderAdmissionDeferredError extends Error {
	readonly retryAt: Date;

	constructor(message: string, retryAt: Date, options?: ErrorOptions) {
		super(message, options);
		this.name = "ProviderAdmissionDeferredError";
		this.retryAt = retryAt;
	}
}

export function providerAdmissionRetryAt(input: {
	now?: Date;
	reopenAt?: Date | null;
	retryAt?: Date | null;
	providerMaxConcurrency?: number;
}): Date {
	const now = input.now ?? new Date();
	if (input.reopenAt && input.reopenAt > now) return new Date(input.reopenAt.getTime() + 1000);
	if (input.retryAt && input.retryAt > now) return new Date(input.retryAt.getTime() + 1000);
	const delayMs = input.providerMaxConcurrency === 0 ? 60 * 60 * 1000 : 30 * 1000;
	return new Date(now.getTime() + delayMs);
}
