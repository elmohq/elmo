import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { buildCloudBillingSubscriptionProjection, createCloudStripeEventHandler } from "./billing-events";
import type {
	CloudBillingProjectionWriter,
	CloudBillingStore,
	CloudBillingSubscriptionProjection,
	CloudStripeWebhookClaimResult,
} from "./billing-store";

function subscriptionItem(
	id: string,
	lookupKey: string | null,
	quantity = 1,
	interval: "month" | "year" = "month",
): Stripe.SubscriptionItem {
	return {
		id,
		quantity,
		current_period_start: 1_700_000_000,
		current_period_end: 1_702_592_000,
		price: {
			id: `price_${lookupKey ?? "unknown"}`,
			lookup_key: lookupKey,
			currency: "usd",
			recurring: { interval, interval_count: 1 },
		},
	} as unknown as Stripe.SubscriptionItem;
}

function subscription(
	items: Stripe.SubscriptionItem[],
	options: {
		id?: string;
		customer?: string;
		status?: Stripe.Subscription.Status;
		metadata?: Record<string, string>;
	} = {},
): Stripe.Subscription {
	return {
		id: options.id ?? "sub_1",
		customer: options.customer ?? "cus_1",
		status: options.status ?? "active",
		metadata: options.metadata ?? {},
		items: { data: items },
		cancel_at_period_end: false,
		cancel_at: null,
		canceled_at: null,
		ended_at: null,
	} as unknown as Stripe.Subscription;
}

function stripeEvent(type: string, object: unknown, id = "evt_1"): Stripe.Event {
	return {
		id,
		type,
		api_version: "2026-07-29.basil",
		created: 1_700_000_100,
		livemode: false,
		data: { object },
	} as unknown as Stripe.Event;
}

function mockStore(
	replaceSubscription = vi.fn(async (_projection: CloudBillingSubscriptionProjection) => ({ applied: true })),
) {
	const writer: CloudBillingProjectionWriter = { replaceSubscription };
	const store: CloudBillingStore = {
		hasOrganizationMembership: vi.fn(async () => true),
		findOrganizationIdByStripeCustomerId: vi.fn(async () => "org_1"),
		claimWebhookEvent: vi.fn(
			async (): Promise<CloudStripeWebhookClaimResult> => ({
				state: "claimed",
				claim: { attemptCount: 1 },
			}),
		),
		finishWebhookEvent: vi.fn(async () => undefined),
		failWebhookEvent: vi.fn(async () => undefined),
		withOrganizationProjection: async <T>(
			_organizationId: string,
			operation: (projectionWriter: CloudBillingProjectionWriter) => Promise<T>,
		) => operation(writer),
	};
	return { store, replaceSubscription };
}

describe("cloud billing subscription projection", () => {
	it("projects one catalog base plan and the Claude add-on quantity", () => {
		const result = buildCloudBillingSubscriptionProjection(
			subscription([
				subscriptionItem("si_base", "elmo_cloud_pro_monthly"),
				subscriptionItem("si_claude", "elmo_cloud_claude_prompt_monthly", 7),
			]),
			{
				organizationId: "org_1",
				eventId: "evt_1",
				eventCreatedAt: new Date("2026-08-05T00:00:00Z"),
				deleted: false,
				syncedAt: new Date("2026-08-05T00:00:01Z"),
			},
		);

		expect(result).toMatchObject({
			organizationId: "org_1",
			stripeSubscriptionId: "sub_1",
			stripeCustomerId: "cus_1",
			status: "active",
			basePlanKey: "pro",
			billingInterval: "month",
			currency: "usd",
		});
		expect(result.items).toEqual([
			expect.objectContaining({ type: "base_plan", quantity: 1, active: true }),
			expect.objectContaining({ type: "premium_addon", quantity: 7, active: true }),
		]);
	});

	it("fails closed when no line item has a recognized base price", () => {
		expect(() =>
			buildCloudBillingSubscriptionProjection(subscription([subscriptionItem("si_unknown", null)]), {
				organizationId: "org_1",
				eventId: "evt_1",
				eventCreatedAt: new Date(),
				deleted: false,
				syncedAt: new Date(),
			}),
		).toThrow(/exactly one recognized base plan price; found 0/);
	});

	it("retains the plan history but deactivates every item for a deleted subscription", () => {
		const eventCreatedAt = new Date("2026-08-05T00:00:00Z");
		const result = buildCloudBillingSubscriptionProjection(
			subscription([subscriptionItem("si_base", "elmo_cloud_starter_monthly")], { status: "canceled" }),
			{
				organizationId: "org_1",
				eventId: "evt_deleted",
				eventCreatedAt,
				deleted: true,
				syncedAt: eventCreatedAt,
			},
		);

		expect(result.status).toBe("canceled");
		expect(result.endedAt).toEqual(eventCreatedAt);
		expect(result.items.every((item) => !item.active)).toBe(true);
	});

	it("rejects add-ons on plans that do not sell Claude tracking", () => {
		expect(() =>
			buildCloudBillingSubscriptionProjection(
				subscription([
					subscriptionItem("si_base", "elmo_cloud_basic_monthly"),
					subscriptionItem("si_claude", "elmo_cloud_claude_prompt_monthly"),
				]),
				{
					organizationId: "org_1",
					eventId: "evt_1",
					eventCreatedAt: new Date(),
					deleted: false,
					syncedAt: new Date(),
				},
			),
		).toThrow(/basic does not support the Claude prompt add-on/);
	});

	it("projects arbitrary prices as custom only with the exact operator metadata", () => {
		const result = buildCloudBillingSubscriptionProjection(
			subscription(
				[
					subscriptionItem("si_contract", null, 3),
					subscriptionItem("si_known_but_custom", "elmo_cloud_claude_prompt_monthly", 2),
				],
				{
					metadata: {
						elmo_plan_id: "custom",
						elmo_billing_source: "operator",
					},
				},
			),
			{
				organizationId: "org_1",
				eventId: "evt_custom",
				eventCreatedAt: new Date("2026-08-05T00:00:00Z"),
				deleted: false,
				syncedAt: new Date("2026-08-05T00:00:01Z"),
			},
		);

		expect(result.basePlanKey).toBe("custom");
		expect(result.items).toEqual([
			expect.objectContaining({ type: "custom", quantity: 3, stripePriceLookupKey: null }),
			expect.objectContaining({
				type: "custom",
				quantity: 2,
				stripePriceLookupKey: "elmo_cloud_claude_prompt_monthly",
			}),
		]);
	});

	it("does not trust a custom plan marker without the operator source marker", () => {
		expect(() =>
			buildCloudBillingSubscriptionProjection(
				subscription([subscriptionItem("si_unknown", null)], {
					metadata: { elmo_plan_id: "custom" },
				}),
				{
					organizationId: "org_1",
					eventId: "evt_1",
					eventCreatedAt: new Date(),
					deleted: false,
					syncedAt: new Date(),
				},
			),
		).toThrow(/exactly one recognized base plan price; found 0/);
	});
});

describe("cloud Stripe event handler", () => {
	it("retrieves and projects Stripe's current subscription instead of trusting stale event data", async () => {
		const stale = subscription([subscriptionItem("si_old", "elmo_cloud_starter_monthly")]);
		const current = subscription([subscriptionItem("si_current", "elmo_cloud_pro_monthly")]);
		const stripeClient = {
			subscriptions: { retrieve: vi.fn(async () => current) },
		} as unknown as Stripe;
		let locked = false;
		const { store, replaceSubscription } = mockStore();
		store.withOrganizationProjection = async <T>(
			_organizationId: string,
			operation: (writer: CloudBillingProjectionWriter) => Promise<T>,
		) => {
			locked = true;
			return operation({ replaceSubscription });
		};
		(stripeClient.subscriptions.retrieve as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			expect(locked).toBe(true);
			return current;
		});

		await createCloudStripeEventHandler({ stripeClient, store })(stripeEvent("customer.subscription.updated", stale));

		expect(replaceSubscription).toHaveBeenCalledOnce();
		const projected = replaceSubscription.mock.calls[0]?.[0] as CloudBillingSubscriptionProjection | undefined;
		if (!projected) throw new Error("Expected a billing projection");
		expect(projected.basePlanKey).toBe("pro");
		expect(store.finishWebhookEvent).toHaveBeenCalledWith("evt_1", { attemptCount: 1 }, "processed", expect.any(Date));
	});

	it("uses the signed deleted-event snapshot only when Stripe reports the resource missing", async () => {
		const deleted = subscription([subscriptionItem("si_base", "elmo_cloud_starter_monthly")], {
			status: "canceled",
		});
		const stripeClient = {
			subscriptions: { retrieve: vi.fn(async () => Promise.reject({ code: "resource_missing" })) },
		} as unknown as Stripe;
		const { store, replaceSubscription } = mockStore();

		await createCloudStripeEventHandler({ stripeClient, store })(
			stripeEvent("customer.subscription.deleted", deleted, "evt_deleted"),
		);

		const projected = replaceSubscription.mock.calls[0]?.[0] as CloudBillingSubscriptionProjection | undefined;
		if (!projected) throw new Error("Expected a billing projection");
		expect(projected.status).toBe("canceled");
		expect(projected.items[0]?.active).toBe(false);
	});

	it("persists irrelevant events as ignored without calling Stripe", async () => {
		const retrieve = vi.fn();
		const stripeClient = { subscriptions: { retrieve } } as unknown as Stripe;
		const { store, replaceSubscription } = mockStore();

		await createCloudStripeEventHandler({ stripeClient, store })(stripeEvent("invoice.paid", {}));

		expect(retrieve).not.toHaveBeenCalled();
		expect(replaceSubscription).not.toHaveBeenCalled();
		expect(store.finishWebhookEvent).toHaveBeenCalledWith("evt_1", { attemptCount: 1 }, "ignored", expect.any(Date));
	});

	it("records projection failures and rethrows so Stripe retries the webhook", async () => {
		const unknown = subscription([subscriptionItem("si_unknown", null)]);
		const stripeClient = {
			subscriptions: { retrieve: vi.fn(async () => unknown) },
		} as unknown as Stripe;
		const { store } = mockStore();
		const handler = createCloudStripeEventHandler({ stripeClient, store });

		await expect(handler(stripeEvent("customer.subscription.updated", unknown))).rejects.toThrow(
			/exactly one recognized base plan price/,
		);
		expect(store.failWebhookEvent).toHaveBeenCalledWith(
			"evt_1",
			{ attemptCount: 1 },
			expect.stringMatching(/exactly one recognized base plan price/),
			expect.any(Date),
		);
		expect(store.finishWebhookEvent).not.toHaveBeenCalled();
	});

	it("acknowledges an already-complete duplicate without reprocessing it", async () => {
		const stripeClient = { subscriptions: { retrieve: vi.fn() } } as unknown as Stripe;
		const { store, replaceSubscription } = mockStore();
		store.claimWebhookEvent = vi.fn(async (): Promise<CloudStripeWebhookClaimResult> => ({ state: "complete" }));

		await createCloudStripeEventHandler({ stripeClient, store })(
			stripeEvent(
				"customer.subscription.updated",
				subscription([subscriptionItem("si_base", "elmo_cloud_starter_monthly")]),
			),
		);

		expect(stripeClient.subscriptions.retrieve).not.toHaveBeenCalled();
		expect(replaceSubscription).not.toHaveBeenCalled();
	});
});
