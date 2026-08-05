import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
	applyCloudDataRetentionProjection,
	buildRetainedProviderAttemptUpdate,
	type CloudDataRetentionBillingSnapshot,
	type CloudDataRetentionCandidate,
	type CloudDataRetentionRunSnapshot,
	type CloudDataRetentionStore,
	type CloudDataRetentionTerminalStatus,
	decideCloudDataRetention,
	nextCloudDataRetentionPurgeAfter,
	reconcileCloudDataRetention,
} from "./data-retention";

const endedAt = new Date("2026-06-01T00:00:00.000Z");
const syncedAt = new Date("2026-06-01T00:01:00.000Z");
const eligibleAt = new Date("2026-07-31T00:00:00.000Z");

function subscription(
	overrides: Partial<Stripe.Subscription> & Pick<Stripe.Subscription, "id" | "status">,
): Stripe.Subscription {
	return {
		created: Math.floor(new Date("2026-05-01T00:00:00.000Z").getTime() / 1_000),
		customer: "cus_1",
		ended_at: Math.floor(endedAt.getTime() / 1_000),
		metadata: { elmo_billing_source: "better-auth", elmo_plan_id: "pro" },
		...overrides,
	} as Stripe.Subscription;
}

function run(
	status: "scheduled" | "confirmed" = "scheduled",
	sourceSubscriptionStatus: CloudDataRetentionTerminalStatus = "canceled",
): CloudDataRetentionRunSnapshot {
	return {
		id: "run_1",
		organizationId: "org_1",
		status,
		stripeCustomerId: "cus_1",
		stripeSubscriptionId: "sub_1",
		sourceSubscriptionStatus,
		sourceSubscriptionEndedAt: endedAt,
		eligibleAt,
		purgeAfter: status === "confirmed" ? new Date("2026-07-31T01:00:00.000Z") : null,
		sourceSubscriptionSyncedAt: syncedAt,
	};
}

function billing(overrides: Partial<CloudDataRetentionBillingSnapshot> = {}): CloudDataRetentionBillingSnapshot {
	return {
		stripeCustomerId: "cus_1",
		stripeSubscriptionId: "sub_1",
		status: "canceled",
		endedAt,
		syncedAt,
		...overrides,
	};
}

function stripeClient(subscriptions: Stripe.Subscription[]): Stripe {
	return {
		subscriptions: {
			list: vi.fn(() => ({
				async *[Symbol.asyncIterator]() {
					for (const item of subscriptions) yield item;
				},
			})),
		},
	} as unknown as Stripe;
}

describe("cloud terminal-subscription retention decisions", () => {
	it.each(["canceled", "incomplete_expired"] as const)(
		"confirms a matching authoritative %s subscription before it can purge",
		(sourceStatus) => {
			expect(
				decideCloudDataRetention({
					run: run("scheduled", sourceStatus),
					billing: billing({ status: sourceStatus }),
					subscriptions: [subscription({ id: "sub_1", status: sourceStatus })],
				}),
			).toEqual({ action: "confirm" });
		},
	);

	it("permits purge only after the run was durably confirmed", () => {
		expect(
			decideCloudDataRetention({
				run: run("confirmed"),
				billing: billing(),
				subscriptions: [subscription({ id: "sub_1", status: "canceled" })],
			}),
		).toEqual({ action: "purge" });
	});

	it.each(["scheduled", "confirmed"] as const)(
		"defers the %s phase while a durable billing mutation or Checkout is pending",
		(status) => {
			expect(
				decideCloudDataRetention({
					run: run(status),
					billing: billing(),
					hasPendingBillingMutation: true,
					subscriptions: [],
				}),
			).toEqual({ action: "defer", reason: "pending-billing-mutation" });
		},
	);

	it.each(["scheduled", "confirmed"] as const)("defers the %s phase while provider work is in flight", (status) => {
		expect(
			decideCloudDataRetention({
				run: run(status),
				billing: billing(),
				hasInFlightProviderWork: true,
				subscriptions: [],
			}),
		).toEqual({ action: "defer", reason: "in-flight-provider-work" });
	});

	it.each(["active", "past_due", "unpaid", "paused", "trialing", "incomplete"] as const)(
		"cancels eligibility when Stripe has a %s subscription",
		(status) => {
			const recovered = subscription({ id: "sub_recovered", status, created: 1_800_000_000 });
			expect(
				decideCloudDataRetention({
					run: run("confirmed"),
					billing: billing(),
					subscriptions: [subscription({ id: "sub_1", status: "canceled" }), recovered],
				}),
			).toEqual({ action: "cancel", reason: `recoverable-subscription:${recovered.id}` });
		},
	);

	it("does not treat a newer terminal failed subscription as recovery", () => {
		const failedRecovery = subscription({
			id: "sub_new",
			status: "incomplete_expired",
			created: 1_800_000_000,
			ended_at: Math.floor(new Date("2026-07-01T00:00:00.000Z").getTime() / 1_000),
		});
		expect(
			decideCloudDataRetention({
				run: run(),
				billing: billing(),
				subscriptions: [subscription({ id: "sub_1", status: "canceled" }), failedRecovery],
			}),
		).toEqual({ action: "confirm" });
	});

	it("fails closed when the local billing projection changed", () => {
		expect(
			decideCloudDataRetention({
				run: run("confirmed"),
				billing: billing({ stripeSubscriptionId: "sub_replacement", status: "active" }),
				subscriptions: [],
			}),
		).toEqual({ action: "cancel", reason: "billing-projection-changed" });
	});

	it("fails closed when the terminal source subscription is missing from Stripe", () => {
		expect(decideCloudDataRetention({ run: run("confirmed"), billing: billing(), subscriptions: [] })).toEqual({
			action: "cancel",
			reason: "authoritative-terminal-subscription-missing",
		});
	});

	it("keeps a durable confirmation window even when confirmation runs late", () => {
		const confirmedAt = new Date("2026-08-02T00:00:00.000Z");
		expect(nextCloudDataRetentionPurgeAfter(confirmedAt, eligibleAt)).toEqual(new Date("2026-08-02T01:00:00.000Z"));
	});

	it("removes customer-linked identities and unstructured errors from retained cost audit", () => {
		const now = new Date("2026-08-02T00:00:00.000Z");
		expect(buildRetainedProviderAttemptUpdate("run_1", now)).toEqual({
			taskId: null,
			brandId: null,
			promptId: null,
			promptRunId: null,
			providerRequestId: null,
			errorMessage: null,
			retentionRunId: "run_1",
			updatedAt: now,
		});
	});
});

describe("cloud retention projection scheduling", () => {
	function transaction() {
		const where = vi.fn(async () => []);
		const set = vi.fn(() => ({ where }));
		const update = vi.fn(() => ({ set }));
		const onConflictDoNothing = vi.fn(async () => undefined);
		const values = vi.fn(() => ({ onConflictDoNothing }));
		const insert = vi.fn(() => ({ values }));
		return { tx: { update, insert }, update, set, where, insert, values, onConflictDoNothing };
	}

	it.each(["canceled", "incomplete_expired"] as const)(
		"schedules exactly sixty days from an accepted %s subscription end",
		async (sourceStatus) => {
			const fake = transaction();
			await applyCloudDataRetentionProjection(fake.tx as never, {
				organizationId: "org_1",
				stripeCustomerId: "cus_1",
				stripeSubscriptionId: "sub_1",
				status: sourceStatus,
				endedAt,
				syncedAt,
			});

			expect(fake.insert).toHaveBeenCalledOnce();
			expect(fake.values).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: "org_1",
					stripeSubscriptionId: "sub_1",
					sourceSubscriptionStatus: sourceStatus,
					sourceSubscriptionEndedAt: endedAt,
					eligibleAt,
				}),
			);
			expect(fake.onConflictDoNothing).toHaveBeenCalledOnce();
			expect(fake.onConflictDoNothing).toHaveBeenCalledWith(expect.objectContaining({ target: expect.any(Array) }));
		},
	);

	it("cancels an open run and never schedules from a recovered projection", async () => {
		const fake = transaction();
		await applyCloudDataRetentionProjection(fake.tx as never, {
			organizationId: "org_1",
			stripeCustomerId: "cus_1",
			stripeSubscriptionId: "sub_2",
			status: "active",
			endedAt: null,
			syncedAt,
		});

		expect(fake.insert).not.toHaveBeenCalled();
		expect(fake.set).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "canceled",
				cancelReason: "authoritative-subscription-status:active",
			}),
		);
	});

	it("starts a new retention cycle when a recoverable Checkout becomes incomplete_expired", async () => {
		const recovery = transaction();
		await applyCloudDataRetentionProjection(recovery.tx as never, {
			organizationId: "org_1",
			stripeCustomerId: "cus_1",
			stripeSubscriptionId: "sub_recovery",
			status: "incomplete",
			endedAt: null,
			syncedAt,
		});
		expect(recovery.insert).not.toHaveBeenCalled();
		expect(recovery.set).toHaveBeenCalledWith(
			expect.objectContaining({ status: "canceled", cancelReason: "authoritative-subscription-status:incomplete" }),
		);

		const recoveryEndedAt = new Date("2026-06-02T00:00:00.000Z");
		const expired = transaction();
		await applyCloudDataRetentionProjection(expired.tx as never, {
			organizationId: "org_1",
			stripeCustomerId: "cus_1",
			stripeSubscriptionId: "sub_recovery",
			status: "incomplete_expired",
			endedAt: recoveryEndedAt,
			syncedAt: new Date("2026-06-02T00:01:00.000Z"),
		});
		expect(expired.values).toHaveBeenCalledWith(
			expect.objectContaining({
				stripeSubscriptionId: "sub_recovery",
				sourceSubscriptionStatus: "incomplete_expired",
				sourceSubscriptionEndedAt: recoveryEndedAt,
				eligibleAt: new Date("2026-08-01T00:00:00.000Z"),
			}),
		);
	});

	it("rejects a terminal projection without an authoritative end timestamp", async () => {
		const fake = transaction();
		await expect(
			applyCloudDataRetentionProjection(fake.tx as never, {
				organizationId: "org_1",
				stripeCustomerId: "cus_1",
				stripeSubscriptionId: "sub_recovery",
				status: "incomplete_expired",
				endedAt: null,
				syncedAt,
			}),
		).rejects.toThrow("invalid ended_at timestamp");
		expect(fake.update).not.toHaveBeenCalled();
		expect(fake.insert).not.toHaveBeenCalled();
	});
});

describe("cloud retention reconciliation", () => {
	const candidate: CloudDataRetentionCandidate = {
		id: "run_1",
		organizationId: "org_1",
		status: "scheduled",
		eligibleAt,
		purgeAfter: null,
	};

	it("checks Stripe from inside the store's organization lock", async () => {
		let decided: unknown;
		const store: CloudDataRetentionStore = {
			listDue: vi.fn(async () => [candidate]),
			withLockedCandidate: vi.fn(async (_candidate, _now, decide) => {
				decided = await decide({
					run: run(),
					billing: billing(),
					hasPendingBillingMutation: false,
					hasInFlightProviderWork: false,
				});
				return "confirmed" as const;
			}),
			recordFailure: vi.fn(),
		};

		await expect(
			reconcileCloudDataRetention({
				stripeClient: stripeClient([subscription({ id: "sub_1", status: "canceled" })]),
				store,
				now: eligibleAt,
			}),
		).resolves.toMatchObject({ due: 1, confirmed: 1, failed: 0 });
		expect(decided).toEqual({ action: "confirm" });
	});

	it("does not contact Stripe or advance either phase while Checkout recovery is pending", async () => {
		const list = vi.fn();
		const client = { subscriptions: { list } } as unknown as Stripe;
		const store: CloudDataRetentionStore = {
			listDue: vi.fn(async () => [{ ...candidate, status: "confirmed" as const, purgeAfter: eligibleAt }]),
			withLockedCandidate: vi.fn(async (_candidate, _now, decide) => {
				const decision = await decide({
					run: run("confirmed"),
					billing: billing(),
					hasPendingBillingMutation: true,
					hasInFlightProviderWork: false,
				});
				expect(decision).toEqual({ action: "defer", reason: "pending-billing-mutation" });
				return "deferred" as const;
			}),
			recordFailure: vi.fn(),
		};

		await expect(reconcileCloudDataRetention({ stripeClient: client, store, now: eligibleAt })).resolves.toMatchObject({
			due: 1,
			deferred: 1,
			purged: 0,
			failed: 0,
		});
		expect(list).not.toHaveBeenCalled();
	});

	it("persists a failed authoritative check without purging", async () => {
		const failure = new Error("Stripe unavailable");
		const failingStripe = {
			subscriptions: {
				list: vi.fn(() => ({
					async *[Symbol.asyncIterator]() {
						yield await Promise.reject(failure);
					},
				})),
			},
		} as unknown as Stripe;
		const recordFailure = vi.fn(async () => undefined);
		const store: CloudDataRetentionStore = {
			listDue: vi.fn(async () => [candidate]),
			withLockedCandidate: vi.fn(async (_candidate, _now, decide) => {
				await decide({
					run: run("confirmed"),
					billing: billing(),
					hasPendingBillingMutation: false,
					hasInFlightProviderWork: false,
				});
				return "purged" as const;
			}),
			recordFailure,
		};

		const result = await reconcileCloudDataRetention({ stripeClient: failingStripe, store, now: eligibleAt });
		expect(result).toMatchObject({ due: 1, purged: 0, failed: 1 });
		expect(recordFailure).toHaveBeenCalledWith(candidate, eligibleAt, "Stripe unavailable");
	});
});
