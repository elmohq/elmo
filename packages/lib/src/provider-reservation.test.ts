import { describe, expect, it } from "vitest";
import { decideExistingProviderReservation, type ExistingProviderReservation } from "./provider-reservation";

const now = new Date("2026-08-10T12:00:00.000Z");

function existing(
	overrides: Partial<ExistingProviderReservation<{ value: string }>> = {},
): ExistingProviderReservation<{ value: string }> {
	return {
		id: "reservation-id",
		provider: "provider-a",
		requestFingerprint: "fingerprint",
		workerId: "worker-a",
		leaseExpiresAt: new Date(now.getTime() + 60_000),
		submissionStartedAt: null,
		externalTaskId: null,
		taskDeadlineAt: null,
		result: null,
		releasedAt: null,
		releaseReason: null,
		retryAllowed: false,
		...overrides,
	};
}

function decide(value: ExistingProviderReservation<{ value: string }>, workerId = "worker-b") {
	return decideExistingProviderReservation({
		existing: value,
		provider: "provider-a",
		requestFingerprint: "fingerprint",
		workerId,
		now,
	});
}

describe("durable provider reservation decisions", () => {
	it("returns a checkpointed result without buying the work again", () => {
		expect(decide(existing({ result: { value: "stored" }, releasedAt: now }))).toEqual({
			state: "cached",
			id: "reservation-id",
			result: { value: "stored" },
			released: true,
		});
	});

	it("does not steal a live lease from another worker", () => {
		expect(decide(existing())).toEqual({
			state: "busy",
			id: "reservation-id",
			retryAt: new Date(now.getTime() + 60_000),
		});
	});

	it("resumes only a provider task with a durable external id", () => {
		expect(decide(existing({ leaseExpiresAt: new Date(now.getTime() - 1), externalTaskId: "provider-task" }))).toEqual({
			state: "resume",
			id: "reservation-id",
			externalTaskId: "provider-task",
		});
		expect(decide(existing({ leaseExpiresAt: new Date(now.getTime() - 1) }))).toEqual({
			state: "prepared",
			id: "reservation-id",
		});
		expect(decide(existing({ leaseExpiresAt: new Date(now.getTime() - 1), submissionStartedAt: now }))).toEqual({
			state: "ambiguous",
			id: "reservation-id",
		});
	});

	it("terminalizes an accepted task after its absolute deadline", () => {
		expect(
			decide(
				existing({
					leaseExpiresAt: new Date(now.getTime() - 1),
					externalTaskId: "provider-task",
					taskDeadlineAt: new Date(now.getTime() - 1),
				}),
			),
		).toEqual({ state: "expired", id: "reservation-id" });
	});

	it("never reuses a unit whose request fingerprint changed", () => {
		expect(
			decideExistingProviderReservation({
				existing: existing({ result: { value: "stored" } }),
				provider: "provider-a",
				requestFingerprint: "different",
				workerId: "worker-b",
				now,
			}),
		).toEqual({ state: "conflict", id: "reservation-id" });
	});

	it("keeps a released result-less unit terminal", () => {
		expect(decide(existing({ releasedAt: now, releaseReason: "provider task failed" }))).toEqual({
			state: "terminal",
			id: "reservation-id",
			reason: "provider task failed",
		});
	});

	it("does not reuse a rejected checkpoint when a bounded retry is allowed", () => {
		expect(
			decide(
				existing({
					result: { value: "invalid" },
					releasedAt: now,
					releaseReason: "invalid provider response",
					retryAllowed: true,
				}),
			),
		).toEqual({ state: "terminal", id: "reservation-id", reason: "invalid provider response" });
	});
});
