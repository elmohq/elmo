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
		leaseExpiresAt: new Date(now.getTime() + 60_000),
		submissionStartedAt: null,
		externalTaskId: null,
		taskDeadlineAt: null,
		result: null,
		releasedAt: null,
		releaseReason: null,
		...overrides,
	};
}

function decide(value: ExistingProviderReservation<{ value: string }>) {
	return decideExistingProviderReservation({
		existing: value,
		provider: "provider-a",
		requestFingerprint: "fingerprint",
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

	it("does not reclaim a live lease even from the same process identity", () => {
		expect(decide(existing())).toEqual({
			state: "busy",
			id: "reservation-id",
			retryAt: new Date(now.getTime() + 60_000),
		});
	});

	it("does not steal a checkpointed result while its processor lease is live", () => {
		expect(decide(existing({ result: { value: "stored" } }))).toEqual({
			state: "busy",
			id: "reservation-id",
			retryAt: new Date(now.getTime() + 60_000),
		});
		expect(decide(existing({ result: { value: "stored" }, leaseExpiresAt: new Date(now.getTime() - 1) }))).toEqual({
			state: "cached",
			id: "reservation-id",
			result: { value: "stored" },
			released: false,
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
});
