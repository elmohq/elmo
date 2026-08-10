/** A credentials, billing, or configuration failure that will not heal by retrying. */
export class ProviderFatalError extends Error {
	readonly taskAccepted: boolean;

	constructor(message: string, options?: ErrorOptions & { taskAccepted?: boolean }) {
		super(message, options);
		this.name = "ProviderFatalError";
		this.taskAccepted = options?.taskAccepted ?? false;
	}
}

/** The provider definitively rejected a request without accepting paid work. */
export class ProviderResponseError extends Error {
	readonly taskAccepted: boolean;

	constructor(message: string, options?: ErrorOptions & { taskAccepted?: boolean }) {
		super(message, options);
		this.name = "ProviderResponseError";
		this.taskAccepted = options?.taskAccepted ?? false;
	}
}

/**
 * A submission received a response, but that response does not prove the paid
 * request was rejected. Replaying these requests can purchase the same work
 * twice, so the durable schedulers quarantine them.
 */
export class ProviderRequestUncertainError extends Error {
	readonly status: number;

	constructor(message: string, status: number, options?: ErrorOptions) {
		super(message, options);
		this.name = "ProviderRequestUncertainError";
		this.status = status;
	}
}

const DEFINITIVE_HTTP_REJECTION_STATUSES = new Set([400, 401, 402, 403, 404, 405, 413, 415, 422]);

/** Classify a POST response without assuming every HTTP error rejected paid work. */
export function providerHttpResponseError(message: string, status: number): Error {
	if (status === 401 || status === 402 || status === 403) return new ProviderFatalError(message);
	if (DEFINITIVE_HTTP_REJECTION_STATUSES.has(status)) return new ProviderResponseError(message);
	return new ProviderRequestUncertainError(message, status);
}

export function errorHasAcceptedTask(error: unknown): boolean {
	return (error instanceof ProviderFatalError || error instanceof ProviderResponseError) && error.taskAccepted;
}

/** Local validation or target configuration made this individual run invalid. */
export class ProviderRunRejectedError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ProviderRunRejectedError";
	}
}

/**
 * The provider accepted durable work, but it has not settled yet. Retrying this
 * same task is safe; submitting a replacement is not.
 */
export class ProviderTaskPendingError extends Error {
	readonly retryAfterMs: number;

	constructor(message: string, retryAfterMs: number, options?: ErrorOptions) {
		super(message, options);
		this.name = "ProviderTaskPendingError";
		this.retryAfterMs = retryAfterMs;
	}
}

/** The provider has definitively finished an accepted task without a usable result. */
export class ProviderTaskFailedError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ProviderTaskFailedError";
	}
}

export function providerErrorStatus(error: unknown): number | null {
	const queue: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }];
	const seen = new Set<object>();
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || typeof current.value !== "object" || current.value === null) continue;
		if (seen.has(current.value)) continue;
		seen.add(current.value);
		const value = current.value as Record<string, unknown>;
		for (const candidate of [value.status, value.statusCode]) {
			if (typeof candidate === "number") return candidate;
		}
		if (current.depth >= 4) continue;
		for (const key of ["response", "cause", "details", "error"]) {
			queue.push({ value: value[key], depth: current.depth + 1 });
		}
	}
	return null;
}

/** True only when an adapter or an allowlisted HTTP status proves no paid work was accepted. */
export function isProviderDefinitivelyRejected(error: unknown): boolean {
	if (error instanceof ProviderFatalError || error instanceof ProviderResponseError) {
		return !error.taskAccepted;
	}
	const status = providerErrorStatus(error);
	return status !== null && DEFINITIVE_HTTP_REJECTION_STATUSES.has(status);
}

/** Authentication, authorization, and billing rejections need operator action. */
export function isProviderFatalError(error: unknown): boolean {
	if (error instanceof ProviderFatalError) return true;
	const status = providerErrorStatus(error);
	return status === 401 || status === 402 || status === 403;
}
