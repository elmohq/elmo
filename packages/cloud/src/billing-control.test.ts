import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
	changeCloudSubscriptionPlan,
	CloudBillingControlError,
	type CloudBillingMutationRecord,
	type CloudBillingControlStore,
	type CloudBillingMutationState,
	type PreparedCloudBillingMutation,
	setCloudClaudeAddonPromptSlots,
	startCloudInitialCheckout,
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
		organization: { name: "Workspace", stripeCustomerId: "cus_1" },
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
	let sequence = 0;
	const mutations: CloudBillingMutationRecord[] = [];
	const beginMutation: CloudBillingControlStore["beginMutation"] = async (
		organizationId,
		mutationId,
		kind,
		prepare,
	) => {
		const same = mutations.find(
			(mutation) => mutation.organizationId === organizationId && mutation.mutationId === mutationId,
		);
		if (same) return { state: same.status, mutation: same };
		const other = mutations.find(
			(mutation) => mutation.organizationId === organizationId && mutation.status === "pending",
		);
		if (other) return { state: "other-pending", mutation: other };
		const prepared: PreparedCloudBillingMutation = await prepare(snapshot);
		sequence++;
		const mutation: CloudBillingMutationRecord = {
			...prepared,
			id: `mutation_${sequence}`,
			organizationId,
			mutationId,
			kind,
			status: "pending",
			stripeIdempotencyKey: `elmo:${organizationId}:${kind}:${mutationId}`,
			attemptCount: 0,
			nextAttemptAt: new Date(),
			lastError: null,
			stripeCheckoutSessionId: null,
			stripeCheckoutSessionUrl: null,
			stripeCheckoutExpiresAt: null,
		};
		mutations.push(mutation);
		return { state: "pending", mutation };
	};
	return {
		load: async () => snapshot,
		beginMutation: vi.fn(beginMutation),
		projectMutation: vi.fn(async (mutation) => {
			mutation.status = "applied";
		}),
		failMutation: vi.fn(async (mutation, error) => {
			mutation.status = "failed";
			mutation.lastError = error;
		}),
		deferMutation: vi.fn(async (mutation, error, retryAt) => {
			mutation.attemptCount++;
			mutation.lastError = error;
			mutation.nextAttemptAt = retryAt;
		}),
		listPendingMutations: vi.fn(async () => []),
		recordCheckoutSession: vi.fn(async (mutation, session) => {
			mutation.stripeCustomerId = session.stripeCustomerId;
			mutation.stripeCheckoutSessionId = session.id;
			mutation.stripeCheckoutSessionUrl = session.url;
			mutation.stripeCheckoutExpiresAt = session.expiresAt;
			return mutation;
		}),
	};
}

function unitAmountForLookupKey(lookupKey: string): number {
	const annualMultiplier = lookupKey.endsWith("annual") ? 10 : 1;
	if (lookupKey.includes("claude_prompt")) return 500 * annualMultiplier;
	if (lookupKey.includes("business")) return 64_900 * annualMultiplier;
	if (lookupKey.includes("pro")) return 29_900 * annualMultiplier;
	if (lookupKey.includes("basic")) return 9_900 * annualMultiplier;
	return 2_900 * annualMultiplier;
}

function subscription(items: Array<{ id: string; lookupKey: string; quantity?: number }>): Stripe.Subscription {
	return {
		id: "sub_1",
		customer: "cus_1",
		status: "active",
		metadata: { elmo_plan_id: "pro", elmo_billing_source: "better-auth" },
		items: {
			data: items.map((item) => ({
				id: item.id,
				quantity: item.quantity,
				current_period_start: 1_785_542_400,
				current_period_end: 1_788_220_800,
				price: {
					id: `price_${item.id}`,
					lookup_key: item.lookupKey,
					active: true,
					currency: "usd",
					unit_amount: unitAmountForLookupKey(item.lookupKey),
					recurring: {
						interval: item.lookupKey.endsWith("annual") ? "year" : "month",
						interval_count: 1,
					},
				},
			})),
		},
		cancel_at_period_end: false,
		cancel_at: null,
		canceled_at: null,
		ended_at: null,
	} as unknown as Stripe.Subscription;
}

function stripeClient(stripeSubscription: Stripe.Subscription) {
	let current = stripeSubscription;
	const update = vi.fn(async (_id: string, params: Stripe.SubscriptionUpdateParams) => {
		const nextItems = [...current.items.data];
		for (const updateItem of params.items ?? []) {
			const existingIndex = updateItem.id ? nextItems.findIndex((item) => item.id === updateItem.id) : -1;
			if (updateItem.deleted && existingIndex >= 0) {
				nextItems.splice(existingIndex, 1);
				continue;
			}
			const lookupKey = updateItem.price?.replace(/^price_/, "") ?? null;
			const interval = lookupKey?.endsWith("annual") ? "year" : "month";
			const price = {
				id: updateItem.price ?? nextItems[existingIndex]?.price.id ?? "price_unknown",
				lookup_key: lookupKey ?? nextItems[existingIndex]?.price.lookup_key ?? null,
				active: true,
				currency: "usd",
				unit_amount: unitAmountForLookupKey(lookupKey ?? "elmo_cloud_pro_monthly"),
				recurring: { interval, interval_count: 1 },
			} as Stripe.Price;
			if (existingIndex >= 0) {
				nextItems[existingIndex] = {
					...nextItems[existingIndex]!,
					price,
					quantity: updateItem.quantity,
				};
			} else {
				nextItems.push({
					id: "addon_created",
					price,
					quantity: updateItem.quantity,
					current_period_start: 1_785_542_400,
					current_period_end: 1_788_220_800,
				} as Stripe.SubscriptionItem);
			}
		}
		current = {
			...current,
			metadata: { ...current.metadata, ...(params.metadata as Record<string, string> | undefined) },
			items: { ...current.items, data: nextItems },
		};
		return current;
	});
	const retrieve = vi.fn(async () => current);
	const list = vi.fn(async (params: Stripe.PriceListParams) => ({
		data: [
			{
				id: `price_${params.lookup_keys?.[0]}`,
				lookup_key: params.lookup_keys?.[0] ?? null,
				currency: "usd",
				unit_amount: unitAmountForLookupKey(params.lookup_keys?.[0] ?? "elmo_cloud_pro_monthly"),
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
				payment_behavior: "error_if_incomplete",
				proration_behavior: "always_invoice",
				expand: ["items.data.price"],
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
				payment_behavior: "error_if_incomplete",
				proration_behavior: "always_invoice",
				expand: ["items.data.price"],
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

	it("denies billing mutations for an unexpected trial subscription", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		const trialing = state({ subscription: { ...state().subscription!, status: "trialing" } });

		await expect(
			changeCloudSubscriptionPlan({
				organizationId: "org_1",
				planId: "business",
				interval: "month",
				mutationId: "trialing",
				stripeClient: stripe.client,
				store: store(trialing),
			}),
		).rejects.toMatchObject({ code: "subscription-not-active" });
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

	it("clears the durable fence only for a definitive Stripe rejection", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		stripe.update.mockRejectedValueOnce(Object.assign(new Error("authentication required"), { statusCode: 402 }));
		const controlStore = store(state());

		await expect(
			changeCloudSubscriptionPlan({
				organizationId: "org_1",
				planId: "business",
				interval: "month",
				mutationId: "payment-rejected",
				stripeClient: stripe.client,
				store: controlStore,
			}),
		).rejects.toMatchObject({ code: "billing-change-failed" });
		expect(controlStore.failMutation).toHaveBeenCalledOnce();
		expect(controlStore.deferMutation).not.toHaveBeenCalled();
	});

	it("keeps the workspace fenced when Stripe's result is unknown", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		const networkError = new Error("connection reset after request");
		stripe.update.mockRejectedValueOnce(networkError);
		const controlStore = store(state());

		await expect(
			changeCloudSubscriptionPlan({
				organizationId: "org_1",
				planId: "business",
				interval: "month",
				mutationId: "unknown-result",
				stripeClient: stripe.client,
				store: controlStore,
			}),
		).rejects.toBe(networkError);
		expect(controlStore.deferMutation).toHaveBeenCalledOnce();
		expect(controlStore.failMutation).not.toHaveBeenCalled();
	});

	it("projects an already-applied idempotent update without charging again", async () => {
		const current = subscription([{ id: "base", lookupKey: "elmo_cloud_business_annual" }]);
		current.metadata.elmo_plan_id = "business";
		const stripe = stripeClient(current);
		const controlStore = store(state());

		await changeCloudSubscriptionPlan({
			organizationId: "org_1",
			planId: "business",
			interval: "year",
			mutationId: "recover-after-crash",
			stripeClient: stripe.client,
			store: controlStore,
		});

		expect(stripe.update).not.toHaveBeenCalled();
		expect(controlStore.projectMutation).toHaveBeenCalledOnce();
	});

	it("creates one durable Checkout session for concurrent initial requests", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		const customerRetrieve = vi.fn(async () => ({
			id: "cus_1",
			metadata: { organizationId: "org_1", customerType: "organization" },
		}));
		let checkoutSession: Stripe.Checkout.Session | undefined;
		const checkoutCreate = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
			checkoutSession = {
				id: "cs_1",
				mode: "subscription",
				status: "open",
				url: "https://checkout.stripe.com/c/pay/cs_1",
				customer: params.customer,
				client_reference_id: params.client_reference_id,
				metadata: params.metadata,
				expires_at: params.expires_at,
			} as Stripe.Checkout.Session;
			return checkoutSession;
		});
		const checkoutRetrieve = vi.fn(async () => checkoutSession!);
		const client = {
			...stripe.client,
			customers: { retrieve: customerRetrieve },
			checkout: { sessions: { create: checkoutCreate, retrieve: checkoutRetrieve } },
		} as unknown as Stripe;
		const controlStore = store(
			state({
				subscription: null,
				usage: { ...emptyUsage, enabledBrands: 1, enabledPrompts: 10 },
			}),
		);
		const request = {
			organizationId: "org_1",
			planId: "starter" as const,
			interval: "month" as const,
			successUrl: "https://app.elmo.test/billing?checkout=success",
			cancelUrl: "https://app.elmo.test/billing?checkout=cancel",
			stripeClient: client,
			store: controlStore,
			now: new Date("2026-08-05T00:00:00Z"),
		};

		await expect(startCloudInitialCheckout({ ...request, mutationId: "checkout-one" })).resolves.toEqual({
			accepted: true,
			url: "https://checkout.stripe.com/c/pay/cs_1",
		});
		await expect(startCloudInitialCheckout({ ...request, mutationId: "checkout-two" })).resolves.toEqual({
			accepted: true,
			url: "https://checkout.stripe.com/c/pay/cs_1",
		});

		expect(checkoutCreate).toHaveBeenCalledOnce();
		expect(checkoutRetrieve).toHaveBeenCalledOnce();
		expect(checkoutCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "subscription",
				automatic_tax: { enabled: true },
				customer: "cus_1",
				client_reference_id: "org_1",
				line_items: [{ price: "price_elmo_cloud_starter_monthly", quantity: 1 }],
			}),
			{ idempotencyKey: "elmo:org_1:checkout:checkout-one" },
		);
	});

	it("reconciles a stored Checkout session instead of returning an expired URL", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		let checkoutSession: Stripe.Checkout.Session | undefined;
		const checkoutCreate = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
			checkoutSession = {
				id: "cs_expiring",
				mode: "subscription",
				status: "open",
				url: "https://checkout.stripe.com/c/pay/cs_expiring",
				customer: params.customer,
				client_reference_id: params.client_reference_id,
				metadata: params.metadata,
				expires_at: params.expires_at,
			} as Stripe.Checkout.Session;
			return checkoutSession;
		});
		const checkoutRetrieve = vi.fn(async () => ({ ...checkoutSession!, status: "expired" as const }));
		const client = {
			...stripe.client,
			customers: {
				retrieve: vi.fn(async () => ({
					id: "cus_1",
					metadata: { organizationId: "org_1", customerType: "organization" },
				})),
			},
			checkout: { sessions: { create: checkoutCreate, retrieve: checkoutRetrieve } },
		} as unknown as Stripe;
		const controlStore = store(
			state({
				subscription: null,
				usage: { ...emptyUsage, enabledBrands: 1, enabledPrompts: 10 },
			}),
		);
		const request = {
			organizationId: "org_1",
			planId: "starter" as const,
			interval: "month" as const,
			successUrl: "https://app.elmo.test/billing?checkout=success",
			cancelUrl: "https://app.elmo.test/billing?checkout=cancel",
			stripeClient: client,
			store: controlStore,
			now: new Date("2026-08-05T00:00:00Z"),
		};

		await startCloudInitialCheckout({ ...request, mutationId: "checkout-expiring" });
		await expect(
			startCloudInitialCheckout({ ...request, mutationId: "checkout-retry" }),
		).rejects.toMatchObject({ code: "billing-change-failed" });
		expect(checkoutRetrieve).toHaveBeenCalledOnce();
		expect(controlStore.failMutation).toHaveBeenCalledOnce();
	});

	it("returns the stored Checkout URL when the same command is already applied", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		const checkoutCreate = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
			id: "cs_applied",
			mode: "subscription",
			status: "open",
			url: "https://checkout.stripe.com/c/pay/cs_applied",
			customer: params.customer,
			client_reference_id: params.client_reference_id,
			metadata: params.metadata,
			expires_at: params.expires_at,
		}));
		const client = {
			...stripe.client,
			customers: {
				retrieve: vi.fn(async () => ({
					id: "cus_1",
					metadata: { organizationId: "org_1", customerType: "organization" },
				})),
			},
			checkout: { sessions: { create: checkoutCreate, retrieve: vi.fn() } },
		} as unknown as Stripe;
		const controlStore = store(
			state({
				subscription: null,
				usage: { ...emptyUsage, enabledBrands: 1, enabledPrompts: 10 },
			}),
		);
		const recordCheckoutSession = controlStore.recordCheckoutSession;
		let recordedMutation: CloudBillingMutationRecord | undefined;
		controlStore.recordCheckoutSession = vi.fn(async (mutation, session, now) => {
			recordedMutation = await recordCheckoutSession(mutation, session, now);
			return recordedMutation;
		});
		const request = {
			organizationId: "org_1",
			planId: "starter" as const,
			interval: "month" as const,
			mutationId: "checkout-applied",
			successUrl: "https://app.elmo.test/billing?checkout=success",
			cancelUrl: "https://app.elmo.test/billing?checkout=cancel",
			stripeClient: client,
			store: controlStore,
		};

		await startCloudInitialCheckout(request);
		if (!recordedMutation) throw new Error("Checkout mutation was not recorded");
		recordedMutation.status = "applied";
		await expect(startCloudInitialCheckout(request)).resolves.toEqual({
			accepted: true,
			url: "https://checkout.stripe.com/c/pay/cs_applied",
		});
		expect(checkoutCreate).toHaveBeenCalledOnce();
	});

	it("returns the Checkout URL when a webhook projects the subscription before the session is recorded", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		const checkoutCreate = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
			id: "cs_raced",
			mode: "subscription",
			status: "open",
			url: "https://checkout.stripe.com/c/pay/cs_raced",
			customer: params.customer,
			client_reference_id: params.client_reference_id,
			metadata: params.metadata,
			expires_at: params.expires_at,
		}));
		const client = {
			...stripe.client,
			customers: {
				retrieve: vi.fn(async () => ({
					id: "cus_1",
					metadata: { organizationId: "org_1", customerType: "organization" },
				})),
			},
			checkout: { sessions: { create: checkoutCreate } },
		} as unknown as Stripe;
		const controlStore = store(
			state({
				subscription: null,
				usage: { ...emptyUsage, enabledBrands: 1, enabledPrompts: 10 },
			}),
		);
		controlStore.recordCheckoutSession = vi.fn(async (mutation) => ({ ...mutation, status: "applied" }));

		await expect(
			startCloudInitialCheckout({
				organizationId: "org_1",
				planId: "starter",
				interval: "month",
				mutationId: "checkout-race",
				successUrl: "https://app.elmo.test/billing?checkout=success",
				cancelUrl: "https://app.elmo.test/billing?checkout=cancel",
				stripeClient: client,
				store: controlStore,
				now: new Date("2026-08-05T00:00:00Z"),
			}),
		).resolves.toEqual({ accepted: true, url: "https://checkout.stripe.com/c/pay/cs_raced" });
		expect(controlStore.deferMutation).not.toHaveBeenCalled();
	});

	it("rejects stored Checkout return URLs that do not share the application origin", async () => {
		const stripe = stripeClient(subscription([{ id: "base", lookupKey: "elmo_cloud_pro_monthly" }]));
		const checkoutCreate = vi.fn();
		const client = {
			...stripe.client,
			customers: {
				retrieve: vi.fn(async () => ({
					id: "cus_1",
					metadata: { organizationId: "org_1", customerType: "organization" },
				})),
			},
			checkout: { sessions: { create: checkoutCreate } },
		} as unknown as Stripe;

		await expect(
			startCloudInitialCheckout({
				organizationId: "org_1",
				planId: "starter",
				interval: "month",
				mutationId: "checkout-cross-origin",
				successUrl: "https://app.elmo.test/billing?checkout=success",
				cancelUrl: "https://attacker.test/billing?checkout=cancel",
				stripeClient: client,
				store: store(
					state({
						subscription: null,
						usage: { ...emptyUsage, enabledBrands: 1, enabledPrompts: 10 },
					}),
				),
			}),
		).rejects.toMatchObject({ code: "invalid-subscription" });
		expect(checkoutCreate).not.toHaveBeenCalled();
	});
});
