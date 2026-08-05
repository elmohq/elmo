import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
	changeCloudSubscriptionPlan,
	CloudBillingControlError,
	type CloudBillingControlStore,
	type CloudBillingMutationState,
	setCloudClaudeAddonPromptSlots,
	validateCloudBillingConfiguration,
	validateCloudInitialCheckout,
} from "./billing-control";

const emptyUsage = {
	enabledBrands: 1,
	enabledPrompts: 10,
	selectedTargetsByBrand: [{ brandId: "brand_1", targetKeys: ["chatgpt"] }],
	claudePromptAssignments: 0,
};

function state(overrides: Partial<CloudBillingMutationState> = {}): CloudBillingMutationState {
	return {
		subscription: {
			stripeSubscriptionId: "sub_1",
			stripeCustomerId: "cus_1",
			status: "active",
			planId: "pro",
			interval: "month",
			currentPeriodStart: new Date("2026-08-01T00:00:00Z"),
			currentPeriodEnd: new Date("2026-09-01T00:00:00Z"),
			cancelAtPeriodEnd: false,
			cancelAt: null,
			syncedAt: new Date("2026-08-05T00:00:00Z"),
			claudeAddonPromptSlots: 0,
		},
		usage: emptyUsage,
		...overrides,
	};
}

function store(snapshot: CloudBillingMutationState): CloudBillingControlStore {
	return {
		load: async () => snapshot,
		withOrganizationLock: async (_organizationId, operation) => operation(snapshot),
	};
}

function subscription(items: Array<{ id: string; lookupKey: string; quantity?: number }>): Stripe.Subscription {
	return {
		id: "sub_1",
		customer: "cus_1",
		metadata: { elmo_plan_id: "pro", elmo_billing_source: "better-auth" },
		items: {
			data: items.map((item) => ({
				id: item.id,
				quantity: item.quantity,
				price: {
					id: `price_${item.id}`,
					lookup_key: item.lookupKey,
					active: true,
					currency: "usd",
					unit_amount: item.lookupKey.includes("claude_prompt")
						? item.lookupKey.endsWith("annual")
							? 5_000
							: 500
						: item.lookupKey.includes("business")
							? item.lookupKey.endsWith("annual")
								? 649_000
								: 64_900
							: 29_900,
					recurring: {
						interval: item.lookupKey.endsWith("annual") ? "year" : "month",
						interval_count: 1,
					},
				},
			})),
		},
	} as unknown as Stripe.Subscription;
}

function stripeClient(stripeSubscription: Stripe.Subscription) {
	const update = vi.fn(async () => stripeSubscription);
	const retrieve = vi.fn(async () => stripeSubscription);
	const list = vi.fn(async (params: Stripe.PriceListParams) => ({
		data: [
			{
				id: `price_${params.lookup_keys?.[0]}`,
				lookup_key: params.lookup_keys?.[0] ?? null,
				currency: "usd",
				unit_amount: params.lookup_keys?.[0]?.includes("claude_prompt")
					? params.lookup_keys?.[0]?.endsWith("annual")
						? 5_000
						: 500
					: params.lookup_keys?.[0]?.includes("business")
						? params.lookup_keys?.[0]?.endsWith("annual")
							? 649_000
							: 64_900
						: 29_900,
				recurring: {
					interval: params.lookup_keys?.[0]?.endsWith("annual") ? "year" : "month",
					interval_count: 1,
				},
			},
		],
	}));
	return {
		client: { subscriptions: { retrieve, update }, prices: { list } } as unknown as Stripe,
		retrieve,
		update,
		list,
	};
}

describe("cloud billing configuration validation", () => {
	it("allows a truly new empty workspace to start on Starter", async () => {
		const fresh = state({
			subscription: null,
			usage: {
				enabledBrands: 0,
				enabledPrompts: 0,
				selectedTargetsByBrand: [],
				claudePromptAssignments: 0,
			},
		});

		await expect(
			validateCloudInitialCheckout({
				organizationId: "org_new",
				planId: "starter",
				store: store(fresh),
			}),
		).resolves.toEqual([]);
	});

	it("blocks a canceled Pro-configured workspace from restarting on Starter", async () => {
		const canceled = state({
			subscription: { ...state().subscription!, status: "canceled" },
			usage: { ...emptyUsage, enabledBrands: 2, enabledPrompts: 150 },
		});

		await expect(
			validateCloudInitialCheckout({
				organizationId: "org_1",
				planId: "starter",
				store: store(canceled),
			}),
		).resolves.toEqual([
			expect.objectContaining({ code: "brand-capacity" }),
			expect.objectContaining({ code: "prompt-capacity" }),
		]);
	});
	it("reports every resource that blocks a downgrade", () => {
		const violations = validateCloudBillingConfiguration({
			planId: "starter",
			claudeAddonPromptSlots: 2,
			usage: {
				enabledBrands: 2,
				enabledPrompts: 51,
				selectedTargetsByBrand: [{ brandId: "brand_1", targetKeys: ["chatgpt", "perplexity"] }],
				claudePromptAssignments: 1,
			},
		});

		expect(violations.map((violation) => violation.code)).toEqual([
			"brand-capacity",
			"prompt-capacity",
			"target-capacity",
			"target-not-available",
			"claude-addon-not-available",
			"claude-capacity",
		]);
	});

	it("accepts a Pro workspace within included Claude capacity", () => {
		expect(
			validateCloudBillingConfiguration({
				planId: "pro",
				claudeAddonPromptSlots: 0,
				usage: { ...emptyUsage, claudePromptAssignments: 20 },
			}),
		).toEqual([]);
	});
});

describe("cloud Stripe billing mutations", () => {
	it("changes the base plan and add-on interval in one idempotent update", async () => {
		const stripe = stripeClient(
			subscription([
				{ id: "base", lookupKey: "elmo_cloud_pro_monthly", quantity: 1 },
				{ id: "addon", lookupKey: "elmo_cloud_claude_prompt_monthly", quantity: 3 },
			]),
		);

		await expect(
			changeCloudSubscriptionPlan({
				organizationId: "org_1",
				planId: "business",
				interval: "year",
				mutationId: "0198-transaction",
				stripeClient: stripe.client,
				store: store(state()),
			}),
		).resolves.toEqual({ accepted: true, stripeSubscriptionId: "sub_1" });

		expect(stripe.update).toHaveBeenCalledWith(
			"sub_1",
			expect.objectContaining({
				items: [
					{ id: "base", price: "price_elmo_cloud_business_annual", quantity: 1 },
					{ id: "addon", price: "price_elmo_cloud_claude_prompt_annual", quantity: 3 },
				],
				payment_behavior: "pending_if_incomplete",
				proration_behavior: "always_invoice",
			}),
			{ idempotencyKey: "elmo:org_1:plan:0198-transaction" },
		);
	});

	it("rejects a downgrade before mutating Stripe when current usage is too high", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		const overCapacity = state({ usage: { ...emptyUsage, enabledPrompts: 51 } });

		await expect(
			changeCloudSubscriptionPlan({
				organizationId: "org_1",
				planId: "starter",
				interval: "month",
				mutationId: "blocked",
				stripeClient: stripe.client,
				store: store(overCapacity),
			}),
		).rejects.toMatchObject({
			code: "configuration-over-capacity",
		});
		expect(stripe.update).not.toHaveBeenCalled();
	});

	it("adds Claude slots on the subscription with capped, idempotent proration", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));

		await setCloudClaudeAddonPromptSlots({
			organizationId: "org_1",
			quantity: 4,
			mutationId: "addon-change",
			stripeClient: stripe.client,
			store: store(state()),
		});

		expect(stripe.update).toHaveBeenCalledWith(
			"sub_1",
			expect.objectContaining({
				items: [{ price: "price_elmo_cloud_claude_prompt_monthly", quantity: 4 }],
				payment_behavior: "pending_if_incomplete",
				proration_behavior: "always_invoice",
			}),
			{ idempotencyKey: "elmo:org_1:addon:addon-change" },
		);
	});

	it("denies every self-serve mutation for custom contracts", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		const custom = state({ subscription: { ...state().subscription!, planId: "custom" } });

		await expect(
			setCloudClaudeAddonPromptSlots({
				organizationId: "org_1",
				quantity: 1,
				mutationId: "custom",
				stripeClient: stripe.client,
				store: store(custom),
			}),
		).rejects.toMatchObject({ code: "custom-plan-read-only" });
		expect(stripe.retrieve).not.toHaveBeenCalled();
	});

	it("rejects malformed base quantities before changing line items", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly", quantity: 2 }]));

		await expect(
			setCloudClaudeAddonPromptSlots({
				organizationId: "org_1",
				quantity: 1,
				mutationId: "malformed",
				stripeClient: stripe.client,
				store: store(state()),
			}),
		).rejects.toMatchObject({ code: "invalid-subscription" });
		expect(stripe.update).not.toHaveBeenCalled();
	});

	it.each([
		["unit_amount", 1],
		["currency", "eur"],
		["active", false],
	] as const)("rejects a current Stripe price with tampered %s", async (field, value) => {
		const current = subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]);
		Object.assign(current.items.data[0]!.price, { [field]: value });
		const stripe = stripeClient(current);

		await expect(
			setCloudClaudeAddonPromptSlots({
				organizationId: "org_1",
				quantity: 1,
				mutationId: `tampered-${field}`,
				stripeClient: stripe.client,
				store: store(state()),
			}),
		).rejects.toMatchObject({ code: "invalid-subscription" });
		expect(stripe.update).not.toHaveBeenCalled();
	});

	it("rejects a tampered current add-on price", async () => {
		const current = subscription([
			{ id: "base", lookupKey: "elmo_cloud_pro_monthly" },
			{ id: "addon", lookupKey: "elmo_cloud_claude_prompt_monthly", quantity: 2 },
		]);
		current.items.data[1]!.price.unit_amount = 1;
		const stripe = stripeClient(current);

		await expect(
			setCloudClaudeAddonPromptSlots({
				organizationId: "org_1",
				quantity: 3,
				mutationId: "tampered-addon",
				stripeClient: stripe.client,
				store: store(state()),
			}),
		).rejects.toMatchObject({ code: "invalid-subscription" });
		expect(stripe.update).not.toHaveBeenCalled();
	});

	it("rejects an expanded Stripe customer belonging to another workspace", async () => {
		const current = subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]);
		current.customer = { id: "cus_other" } as Stripe.Customer;
		const stripe = stripeClient(current);

		await expect(
			setCloudClaudeAddonPromptSlots({
				organizationId: "org_1",
				quantity: 1,
				mutationId: "wrong-customer",
				stripeClient: stripe.client,
				store: store(state()),
			}),
		).rejects.toMatchObject({ code: "invalid-subscription" });
		expect(stripe.update).not.toHaveBeenCalled();
	});
});
