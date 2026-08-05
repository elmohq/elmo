import { CLOUD_PLAN_CATALOG } from "@workspace/config/plans";
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
	type CloudSubscriptionReconciliationStore,
	reconcileAuthoritativeCloudSubscriptions,
	selectAuthoritativeCloudSubscriptions,
} from "./subscription-reconciliation";

function subscription(
	id: string,
	status: Stripe.Subscription.Status = "active",
	overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
	return {
		id,
		customer: "cus_1",
		status,
		created: id === "sub_old" ? 1 : 2,
		metadata: { elmo_plan_id: "starter", elmo_billing_source: "better-auth" },
		items: {
			data: [
				{
					id: `si_${id}`,
					quantity: 1,
					current_period_start: 1_786_000_000,
					current_period_end: 1_788_592_000,
					price: {
						id: "price_starter",
						lookup_key: "elmo_cloud_starter_monthly",
						active: true,
						currency: "usd",
						unit_amount:
							CLOUD_PLAN_CATALOG.starter.billing.kind === "self-serve"
								? CLOUD_PLAN_CATALOG.starter.billing.monthly.unitAmountCents
								: 0,
						recurring: { interval: "month", interval_count: 1 },
					},
				},
			],
		},
		cancel_at_period_end: false,
		cancel_at: null,
		canceled_at: status === "canceled" ? 1_787_000_000 : null,
		ended_at: status === "canceled" || status === "incomplete_expired" ? 1_787_000_000 : null,
		...overrides,
	} as unknown as Stripe.Subscription;
}

describe("selectAuthoritativeCloudSubscriptions", () => {
	it("replaces a terminal local subscription with the customer's only live subscription", () => {
		const current = subscription("sub_old", "canceled");
		const replacement = subscription("sub_new");
		expect(
			selectAuthoritativeCloudSubscriptions({
				currentSubscriptionId: current.id,
				subscriptions: [replacement, current],
			}),
		).toEqual({ ordered: [current, replacement], conflictIds: [] });
	});

	it("turns multiple live subscriptions into an explicit fail-closed conflict", () => {
		const current = subscription("sub_old");
		const duplicate = subscription("sub_new", "past_due");
		expect(
			selectAuthoritativeCloudSubscriptions({
				currentSubscriptionId: current.id,
				subscriptions: [duplicate, current],
			}),
		).toEqual({ ordered: [current], conflictIds: ["sub_new", "sub_old"] });
	});

	it("records a conflict even when the local projection is already terminal", () => {
		const current = subscription("sub_old", "canceled");
		const first = subscription("sub_first");
		const second = subscription("sub_second", "past_due");
		expect(
			selectAuthoritativeCloudSubscriptions({
				currentSubscriptionId: current.id,
				subscriptions: [first, current, second],
			}),
		).toEqual({ ordered: [current], conflictIds: ["sub_first", "sub_second"] });
	});

	it("replaces an older terminal projection with the latest authoritative terminal subscription", () => {
		const current = subscription("sub_old", "canceled", { ended_at: 1_787_000_000 });
		const failedRecovery = subscription("sub_new", "incomplete_expired", { ended_at: 1_788_000_000 });
		expect(
			selectAuthoritativeCloudSubscriptions({
				currentSubscriptionId: current.id,
				subscriptions: [failedRecovery, current],
			}),
		).toEqual({ ordered: [current, failedRecovery], conflictIds: [] });
	});

	it("fails closed when a managed terminal subscription has no authoritative end timestamp", () => {
		const current = subscription("sub_old", "canceled");
		const ambiguous = subscription("sub_new", "incomplete_expired", { ended_at: null });
		expect(() =>
			selectAuthoritativeCloudSubscriptions({
				currentSubscriptionId: current.id,
				subscriptions: [current, ambiguous],
			}),
		).toThrow("has no authoritative ended_at timestamp");
	});

	it("ignores unmanaged terminal subscriptions when choosing the retention source", () => {
		const current = subscription("sub_old", "canceled");
		const unmanaged = subscription("sub_new", "incomplete_expired", {
			ended_at: 1_788_000_000,
			metadata: {},
		});
		expect(
			selectAuthoritativeCloudSubscriptions({
				currentSubscriptionId: current.id,
				subscriptions: [unmanaged, current],
			}),
		).toEqual({ ordered: [current], conflictIds: [] });
	});

	it("uses a stable subscription identity when terminal end timestamps are equal", () => {
		const current = subscription("sub_z", "canceled");
		const tied = subscription("sub_a", "incomplete_expired");
		for (const subscriptions of [
			[current, tied],
			[tied, current],
		]) {
			expect(
				selectAuthoritativeCloudSubscriptions({
					currentSubscriptionId: current.id,
					subscriptions,
				}),
			).toEqual({ ordered: [current, tied], conflictIds: [] });
		}
	});

	it("fails closed if a managed result belongs to another Stripe customer", () => {
		const current = subscription("sub_old", "canceled");
		const foreign = subscription("sub_new", "incomplete_expired", { customer: "cus_other" });
		expect(() =>
			selectAuthoritativeCloudSubscriptions({
				currentSubscriptionId: current.id,
				subscriptions: [current, foreign],
			}),
		).toThrow("for another customer");
	});

	it("rejects a customer list that no longer contains the locally projected subscription", () => {
		expect(() =>
			selectAuthoritativeCloudSubscriptions({
				currentSubscriptionId: "sub_missing",
				subscriptions: [subscription("sub_new")],
			}),
		).toThrow("no longer returns projected subscription");
	});
});

describe("reconcileAuthoritativeCloudSubscriptions", () => {
	it("projects a missed recovery Checkout expiration before its new retention clock can run", async () => {
		const store: CloudSubscriptionReconciliationStore = {
			listDue: vi.fn(async () => [
				{
					organizationId: "org_1",
					stripeSubscriptionId: "sub_old",
					stripeCustomerId: "cus_1",
					syncedAt: new Date("2026-08-05T11:00:00Z"),
				},
			]),
			project: vi.fn(async () => "projected" as const),
		};
		const oldCancellation = subscription("sub_old", "canceled", { ended_at: 1_787_000_000 });
		const failedRecovery = subscription("sub_new", "incomplete_expired", { ended_at: 1_788_000_000 });
		const stripeClient = {
			subscriptions: {
				list: vi.fn(() => ({
					async *[Symbol.asyncIterator]() {
						yield failedRecovery;
						yield oldCancellation;
					},
				})),
			},
		} as unknown as Stripe;

		await expect(
			reconcileAuthoritativeCloudSubscriptions({ stripeClient, store, now: new Date("2026-08-05T12:00:00Z") }),
		).resolves.toEqual({ reconciled: 1, failed: 0 });
		expect(store.project).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: "org_1", stripeSubscriptionId: "sub_old" }),
			[
				expect.objectContaining({ stripeSubscriptionId: "sub_old", status: "canceled" }),
				expect.objectContaining({
					stripeSubscriptionId: "sub_new",
					status: "incomplete_expired",
					endedAt: new Date(1_788_000_000 * 1_000),
				}),
			],
		);
	});

	it("lists the complete customer subscription set and projects an explicit conflict", async () => {
		const projected = vi.fn(
			async (
				_candidate: Parameters<CloudSubscriptionReconciliationStore["project"]>[0],
				_projections: Parameters<CloudSubscriptionReconciliationStore["project"]>[1],
			) => undefined,
		);
		const store: CloudSubscriptionReconciliationStore = {
			listDue: vi.fn(async () => [
				{
					organizationId: "org_1",
					stripeSubscriptionId: "sub_old",
					stripeCustomerId: "cus_1",
					syncedAt: new Date("2026-08-05T11:00:00Z"),
				},
			]),
			project: vi.fn(async (candidate, projections) => {
				await projected(candidate, projections);
				return "projected" as const;
			}),
		};
		const stripeClient = {
			subscriptions: {
				list: vi.fn(() => ({
					async *[Symbol.asyncIterator]() {
						yield subscription("sub_old");
						yield subscription("sub_new");
					},
				})),
			},
		} as unknown as Stripe;

		await expect(
			reconcileAuthoritativeCloudSubscriptions({ stripeClient, store, now: new Date("2026-08-05T12:00:00Z") }),
		).resolves.toEqual({ reconciled: 1, failed: 0 });
		expect(projected).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: "org_1", stripeSubscriptionId: "sub_old" }),
			[
				expect.objectContaining({
					stripeSubscriptionId: "sub_old",
					status: "billing_conflict",
				}),
			],
		);
	});

	it("does not count a snapshot superseded by a concurrent webhook or billing mutation", async () => {
		const store: CloudSubscriptionReconciliationStore = {
			listDue: vi.fn(async () => [
				{
					organizationId: "org_1",
					stripeSubscriptionId: "sub_old",
					stripeCustomerId: "cus_1",
					syncedAt: new Date("2026-08-05T11:00:00Z"),
				},
			]),
			project: vi.fn(async () => "superseded" as const),
		};
		const stripeClient = {
			subscriptions: {
				list: vi.fn(() => ({
					async *[Symbol.asyncIterator]() {
						yield subscription("sub_old");
					},
				})),
			},
		} as unknown as Stripe;

		await expect(reconcileAuthoritativeCloudSubscriptions({ stripeClient, store })).resolves.toEqual({
			reconciled: 0,
			failed: 0,
		});
	});
});
