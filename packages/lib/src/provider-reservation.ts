export interface ExistingProviderReservation<TResult = unknown> {
	id: string;
	provider: string;
	requestFingerprint: string | null;
	workerId: string;
	leaseExpiresAt: Date | null;
	submissionStartedAt: Date | null;
	externalTaskId: string | null;
	taskDeadlineAt: Date | null;
	result: TResult | null;
	releasedAt: Date | null;
	releaseReason: string | null;
	retryAllowed: boolean;
}

export type ExistingProviderReservationDecision<TResult = unknown> =
	| { state: "cached"; id: string; result: TResult; released: boolean }
	| { state: "busy"; id: string; retryAt: Date }
	| { state: "prepared"; id: string }
	| { state: "resume"; id: string; externalTaskId: string }
	| { state: "expired"; id: string }
	| { state: "ambiguous"; id: string }
	| { state: "terminal"; id: string; reason: string | null }
	| { state: "conflict"; id: string };

/** Pure decision boundary used before any durable reservation is reclaimed. */
export function decideExistingProviderReservation<TResult>(input: {
	existing: ExistingProviderReservation<TResult>;
	provider: string;
	requestFingerprint?: string;
	workerId: string;
	now: Date;
}): ExistingProviderReservationDecision<TResult> {
	const { existing } = input;
	if (
		existing.provider !== input.provider ||
		(existing.requestFingerprint !== null && existing.requestFingerprint !== input.requestFingerprint)
	) {
		return { state: "conflict", id: existing.id };
	}
	if (existing.result !== null && !(existing.releasedAt !== null && existing.retryAllowed)) {
		return { state: "cached", id: existing.id, result: existing.result, released: existing.releasedAt !== null };
	}
	if (existing.releasedAt !== null) {
		return { state: "terminal", id: existing.id, reason: existing.releaseReason };
	}
	if (existing.leaseExpiresAt && existing.leaseExpiresAt > input.now && existing.workerId !== input.workerId) {
		return { state: "busy", id: existing.id, retryAt: existing.leaseExpiresAt };
	}
	if (existing.externalTaskId) {
		if (existing.taskDeadlineAt && existing.taskDeadlineAt <= input.now) {
			return { state: "expired", id: existing.id };
		}
		return { state: "resume", id: existing.id, externalTaskId: existing.externalTaskId };
	}
	if (existing.submissionStartedAt === null) {
		return { state: "prepared", id: existing.id };
	}
	return { state: "ambiguous", id: existing.id };
}
