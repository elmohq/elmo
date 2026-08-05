import { CLOUD_PLAN_CATALOG } from "@workspace/config/plans";
import type Stripe from "stripe";
import { validateCloudCatalogPrice } from "./billing-catalog";
import {
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_CUSTOM_BILLING_SOURCE,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
} from "./billing-metadata";
import {
	type CloudBillingStore,
	type CloudBillingSubscriptionItemProjection,
	type CloudBillingSubscriptionProjection,
	type CloudStripeWebhookEnvelope,
	createDrizzleCloudBillingStore,
} from "./billing-store";

export {
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_CUSTOM_BILLING_SOURCE,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
	CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
} from "./billing-metadata";

interface SubscriptionEventReference {
	subscriptionId: string;
	stripeCustomerId: string | null;
	deletedSnapshot?: Stripe.Subscription;
	deleted: boolean;
}

export interface CreateCloudStripeEventHandlerOptions {
	stripeClient: Stripe;
	store?: CloudBillingStore;
	now?: () => Date;
	logger?: { warn: (...values: unknown[]) => void };
}

export interface BuildCloudBillingSubscriptionProjectionOptions {
	organizationId: string;
	eventId: string | null;
	eventCreatedAt: Date;
	deleted: boolean;
	syncedAt: Date;
}

function asJsonObject(value: unknown): Record<string, unknown> {
	return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function asDate(epochSeconds: number | null): Date | null {
	return epochSeconds === null ? null : new Date(epochSeconds * 1000);
}

function getId(value: { id: string } | string | null): string | null {
	if (!value) return null;
	return typeof value === "string" ? value : value.id;
}

function getSubscriptionEventReference(event: Stripe.Event): SubscriptionEventReference | null {
	if (event.type === "checkout.session.completed") {
		const session = event.data.object as Stripe.Checkout.Session;
		const subscriptionId = getId(session.subscription);
		if (!subscriptionId) return null;
		return {
			subscriptionId,
			stripeCustomerId: getId(session.customer),
			deleted: false,
		};
	}

	if (
		event.type !== "customer.subscription.created" &&
		event.type !== "customer.subscription.updated" &&
		event.type !== "customer.subscription.deleted"
	) {
		return null;
	}

	const subscription = event.data.object as Stripe.Subscription;
	return {
		subscriptionId: subscription.id,
		stripeCustomerId: getId(subscription.customer),
		deletedSnapshot: event.type === "customer.subscription.deleted" ? subscription : undefined,
		deleted: event.type === "customer.subscription.deleted",
	};
}

function isResourceMissing(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as { code?: unknown; statusCode?: unknown };
	return candidate.code === "resource_missing" || candidate.statusCode === 404;
}

async function retrieveSubscription(
	stripeClient: Stripe,
	reference: SubscriptionEventReference,
): Promise<Stripe.Subscription> {
	try {
		return await stripeClient.subscriptions.retrieve(reference.subscriptionId, {
			expand: ["items.data.price"],
		});
	} catch (error) {
		if (reference.deletedSnapshot && isResourceMissing(error)) return reference.deletedSnapshot;
		throw error;
	}
}

function validateQuantity(item: Stripe.SubscriptionItem): number {
	const quantity = item.quantity ?? 1;
	if (!Number.isSafeInteger(quantity) || quantity <= 0) {
		throw new Error(`Stripe subscription item ${item.id} has invalid quantity ${quantity}`);
	}
	return quantity;
}

function requireLookupKey(item: Stripe.SubscriptionItem): string {
	if (!item.price.lookup_key) {
		throw new Error(`Catalog Stripe subscription item ${item.id} has no lookup key`);
	}
	return item.price.lookup_key;
}

function isSupportedBillingInterval(value: string): value is "month" | "year" {
	return value === "month" || value === "year";
}

function isOperatorManagedCustomSubscription(subscription: Stripe.Subscription): boolean {
	return (
		subscription.metadata?.[CLOUD_STRIPE_PLAN_METADATA_KEY] === "custom" &&
		subscription.metadata?.[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY] === CLOUD_STRIPE_CUSTOM_BILLING_SOURCE
	);
}

function buildCustomSubscriptionProjection(
	subscription: Stripe.Subscription,
	options: BuildCloudBillingSubscriptionProjectionOptions,
): CloudBillingSubscriptionProjection {
	const customItems = subscription.items.data.map((item) => {
		const quantity = validateQuantity(item);
		const recurring = item.price.recurring;
		if (!recurring || !isSupportedBillingInterval(recurring.interval) || recurring.interval_count !== 1) {
			throw new Error(`Custom Stripe subscription item ${item.id} must recur every one month or year`);
		}
		const interval = recurring.interval;
		return { item, quantity, interval };
	});
	const representative = customItems.at(0);
	if (!representative) {
		throw new Error(`Custom Stripe subscription ${subscription.id} must contain at least one recurring price`);
	}
	if (
		customItems.some(
			({ item, interval }) =>
				interval !== representative.interval || item.price.currency !== representative.item.price.currency,
		)
	) {
		throw new Error(`Custom Stripe subscription ${subscription.id} must use one billing interval and currency`);
	}

	const stripeCustomerId = getId(subscription.customer);
	if (!stripeCustomerId) throw new Error(`Stripe subscription ${subscription.id} has no customer`);
	const itemActive = !options.deleted;

	return {
		organizationId: options.organizationId,
		stripeSubscriptionId: subscription.id,
		stripeCustomerId,
		status: options.deleted ? "canceled" : subscription.status,
		basePlanKey: "custom",
		billingInterval: representative.interval,
		currency: representative.item.price.currency,
		currentPeriodStart: new Date(representative.item.current_period_start * 1000),
		currentPeriodEnd: new Date(representative.item.current_period_end * 1000),
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		cancelAt: asDate(subscription.cancel_at),
		canceledAt: asDate(subscription.canceled_at),
		endedAt: asDate(subscription.ended_at) ?? (options.deleted ? options.eventCreatedAt : null),
		sourceEventId: options.eventId,
		sourceEventCreatedAt: options.eventCreatedAt,
		sourceSnapshot: asJsonObject(subscription),
		syncedAt: options.syncedAt,
		items: customItems.map(({ item, quantity }) => ({
			stripeSubscriptionItemId: item.id,
			stripePriceId: item.price.id,
			stripePriceLookupKey: item.price.lookup_key,
			type: "custom",
			quantity,
			active: itemActive,
			sourceSnapshot: asJsonObject(item),
		})),
	};
}

export function buildCloudBillingSubscriptionProjection(
	subscription: Stripe.Subscription,
	options: BuildCloudBillingSubscriptionProjectionOptions,
): CloudBillingSubscriptionProjection {
	if (isOperatorManagedCustomSubscription(subscription)) {
		return buildCustomSubscriptionProjection(subscription, options);
	}

	const examinedItems = subscription.items.data.map((item) => ({
		item,
		identity: validateCloudCatalogPrice(item.price, { requireActive: !options.deleted }),
		quantity: validateQuantity(item),
	}));
	const recognizedBaseItems = examinedItems.filter(({ identity }) => identity?.kind === "base_plan");
	if (recognizedBaseItems.length !== 1) {
		const priceList = subscription.items.data.map((item) => item.price.lookup_key ?? item.price.id).join(", ");
		throw new Error(
			`Stripe subscription ${subscription.id} must contain exactly one recognized base plan price; found ${recognizedBaseItems.length} (${priceList || "no prices"})`,
		);
	}
	const unsupportedItem = examinedItems.find(({ identity }) => !identity);
	if (unsupportedItem) {
		throw new Error(
			`Stripe subscription ${subscription.id} contains unsupported price ${unsupportedItem.item.price.lookup_key ?? unsupportedItem.item.price.id}`,
		);
	}
	const classified = examinedItems as Array<{
		item: Stripe.SubscriptionItem;
		identity: NonNullable<(typeof examinedItems)[number]["identity"]>;
		quantity: number;
	}>;
	const baseItems = classified.filter(({ identity }) => identity.kind === "base_plan");

	const premiumItems = classified.filter(({ identity }) => identity.kind === "premium_addon");
	if (premiumItems.length > 1) {
		throw new Error(`Stripe subscription ${subscription.id} contains multiple Claude add-on line items`);
	}

	const base = baseItems.at(0);
	if (!base) throw new Error(`Stripe subscription ${subscription.id} has no recognized base plan price`);
	const planId = base.identity.planId;
	if (!planId) throw new Error(`Stripe base price ${base.item.price.id} is missing its plan identity`);
	if (base.quantity !== 1) {
		throw new Error(`Stripe base plan item ${base.item.id} must have quantity 1; found ${base.quantity}`);
	}
	if (
		base.item.price.recurring?.interval !== base.identity.interval ||
		base.item.price.recurring.interval_count !== 1
	) {
		throw new Error(`Stripe base plan item ${base.item.id} has a billing interval that differs from its lookup key`);
	}

	const premium = premiumItems[0];
	if (premium) {
		if (
			premium.item.price.recurring?.interval !== premium.identity.interval ||
			premium.item.price.recurring.interval_count !== 1 ||
			premium.identity.interval !== base.identity.interval
		) {
			throw new Error(`Stripe Claude add-on item ${premium.item.id} does not match the base plan billing interval`);
		}

		const plan = CLOUD_PLAN_CATALOG[planId];
		if (
			plan.entitlements.kind !== "catalog" ||
			!plan.entitlements.value.claudeTracking.enabled ||
			!plan.entitlements.value.claudeTracking.addon.enabled
		) {
			throw new Error(`Cloud plan ${planId} does not support the Claude prompt add-on`);
		}
		if (premium.quantity > plan.entitlements.value.claudeTracking.addon.maximumAdditionalPromptSlots) {
			throw new Error(`Stripe Claude add-on quantity ${premium.quantity} exceeds the ${planId} plan maximum`);
		}
	}

	const stripeCustomerId = getId(subscription.customer);
	if (!stripeCustomerId) throw new Error(`Stripe subscription ${subscription.id} has no customer`);

	const itemActive = !options.deleted;
	const items: CloudBillingSubscriptionItemProjection[] = classified.map(({ item, identity, quantity }) => ({
		stripeSubscriptionItemId: item.id,
		stripePriceId: item.price.id,
		stripePriceLookupKey: requireLookupKey(item),
		type: identity.kind,
		quantity,
		active: itemActive,
		sourceSnapshot: asJsonObject(item),
	}));

	return {
		organizationId: options.organizationId,
		stripeSubscriptionId: subscription.id,
		stripeCustomerId,
		status: options.deleted ? "canceled" : subscription.status,
		basePlanKey: planId,
		billingInterval: base.identity.interval,
		currency: base.item.price.currency,
		currentPeriodStart: new Date(base.item.current_period_start * 1000),
		currentPeriodEnd: new Date(base.item.current_period_end * 1000),
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		cancelAt: asDate(subscription.cancel_at),
		canceledAt: asDate(subscription.canceled_at),
		endedAt: asDate(subscription.ended_at) ?? (options.deleted ? options.eventCreatedAt : null),
		sourceEventId: options.eventId,
		sourceEventCreatedAt: options.eventCreatedAt,
		sourceSnapshot: asJsonObject(subscription),
		syncedAt: options.syncedAt,
		items,
	};
}

function webhookEnvelope(event: Stripe.Event): CloudStripeWebhookEnvelope {
	return {
		id: event.id,
		type: event.type,
		apiVersion: event.api_version ?? null,
		livemode: event.livemode,
		createdAt: new Date(event.created * 1000),
		payload: asJsonObject(event),
	};
}

function errorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.slice(0, 10_000);
}

function boundedLogValue(value: string): string {
	return value.slice(0, 128);
}

function warnIgnoredUnownedCustomer(
	logger: { warn: (...values: unknown[]) => void },
	event: Stripe.Event,
	stripeCustomerId: string,
): void {
	try {
		logger.warn("[cloud-billing] Ignored Stripe subscription event for an unowned customer", {
			eventId: boundedLogValue(event.id),
			eventType: boundedLogValue(event.type),
			stripeCustomerId: boundedLogValue(stripeCustomerId),
		});
	} catch {
		// A logging transport must never turn a safely ignored webhook into a retry loop.
	}
}

/**
 * Persist and reconcile the authoritative Stripe snapshot. Better Auth invokes
 * this through `onEvent`, whose errors propagate back to Stripe and trigger a
 * retry; its subscription callbacks intentionally are not used for projection.
 */
export function createCloudStripeEventHandler(options: CreateCloudStripeEventHandlerOptions) {
	const store = options.store ?? createDrizzleCloudBillingStore();
	const now = options.now ?? (() => new Date());
	const logger = options.logger ?? console;

	return async (event: Stripe.Event): Promise<void> => {
		const envelope = webhookEnvelope(event);
		const claimed = await store.claimWebhookEvent(envelope, now());
		if (claimed.state !== "claimed") {
			if (claimed.state === "complete") return;
			// The holder may have crashed after acquiring its lease. A successful
			// response would stop Stripe retries and strand the inbox row forever.
			throw new Error(`Stripe webhook ${event.id} is already processing; retry after its lease expires`);
		}

		try {
			const reference = getSubscriptionEventReference(event);
			if (!reference) {
				await store.finishWebhookEvent(event.id, claimed.claim, "ignored", now(), "no-subscription-reference");
				return;
			}

			let stripeCustomerId = reference.stripeCustomerId;
			if (!stripeCustomerId) {
				const subscription = await retrieveSubscription(options.stripeClient, reference);
				stripeCustomerId = getId(subscription.customer);
			}
			if (!stripeCustomerId) throw new Error(`Stripe subscription ${reference.subscriptionId} has no customer`);

			const organizationId = await store.findOrganizationIdByStripeCustomerId(stripeCustomerId);
			if (!organizationId) {
				await store.finishWebhookEvent(event.id, claimed.claim, "ignored", now(), "unowned-stripe-customer");
				warnIgnoredUnownedCustomer(logger, event, stripeCustomerId);
				return;
			}

			await store.withOrganizationProjection(organizationId, async (writer) => {
				const subscription = await retrieveSubscription(options.stripeClient, reference);
				const currentCustomerId = getId(subscription.customer);
				if (currentCustomerId !== stripeCustomerId) {
					throw new Error(
						`Stripe subscription ${subscription.id} changed customers while its webhook was being reconciled`,
					);
				}

				const projection = buildCloudBillingSubscriptionProjection(subscription, {
					organizationId,
					eventId: event.id,
					eventCreatedAt: envelope.createdAt,
					deleted: reference.deleted,
					syncedAt: now(),
				});
				await writer.replaceSubscription(projection);
			});

			await store.finishWebhookEvent(event.id, claimed.claim, "processed", now());
		} catch (error) {
			try {
				await store.failWebhookEvent(event.id, claimed.claim, errorMessage(error), now());
			} catch (persistenceError) {
				throw new AggregateError(
					[error, persistenceError],
					`Stripe webhook ${event.id} failed and its failure state could not be persisted`,
				);
			}
			throw error;
		}
	};
}
