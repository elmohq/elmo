import type { Meta, StoryObj } from "@storybook/react";
import { type EntitlementOverrides, resolveEntitlements } from "@workspace/config/entitlements";
import { isPremiumAddonAvailable, type PlanKey } from "@workspace/config/plans";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/settings/billing";
import type { BillingState } from "@/server/billing";
import { resetMockAuthClient, setMockSubscriptionDelay } from "./_mocks/auth-client";
import { setMockAddonError } from "./_mocks/server-billing";
import { setMockLoaderData } from "./_mocks/tanstack-router";

// The route file exports only `Route`; render its component via route options.
const BillingSettingsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

const NOW = new Date("2026-08-08T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

interface StateSpec {
	/** Null means no subscription on file at all. */
	plan?: PlanKey | null;
	status?: string;
	periodEnd?: Date | null;
	/** Purchased extra Claude prompts; drives both the pool and the card. */
	addonQuantity?: number;
	overrides?: EntitlementOverrides;
	role?: string;
	cancelAtPeriodEnd?: boolean;
	billingInterval?: string;
	usage?: BillingState["usage"];
}

function billingState(spec: StateSpec = {}): BillingState {
	const plan = spec.plan === undefined ? "pro" : spec.plan;
	const status = spec.status ?? "active";
	const periodEnd = spec.periodEnd === undefined ? new Date(NOW.getTime() + 20 * DAY_MS) : spec.periodEnd;
	const addonQuantity = spec.addonQuantity ?? 0;

	const entitlements = resolveEntitlements({
		mode: "cloud",
		subscription: plan ? { status, plan, periodEnd } : null,
		premiumAddonQuantity: addonQuantity,
		overrides: spec.overrides ?? null,
		now: NOW,
	});

	return {
		billingEnabled: true,
		organization: { id: "org-1", name: "Acme", role: spec.role ?? "admin" },
		entitlements,
		subscription: plan
			? {
					id: "sub_1",
					plan,
					status,
					periodEnd: periodEnd?.toISOString() ?? null,
					cancelAtPeriodEnd: spec.cancelAtPeriodEnd ?? false,
					billingInterval: spec.billingInterval ?? "month",
					seats: null,
				}
			: null,
		premiumAddonQuantity: addonQuantity,
		premiumAddonAvailable: isPremiumAddonAvailable(entitlements.planKey),
		usage: spec.usage ?? { brands: 1, enabledPrompts: 84, premiumAssigned: 12 },
	};
}

function renderWith(spec: StateSpec = {}) {
	setMockLoaderData(billingState(spec));
	return <BillingSettingsPage />;
}

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">{children}</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Cloud/Billing Settings",
	component: BillingSettingsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			resetMockAuthClient();
			setMockAddonError(null);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof BillingSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProPlan: Story = {
	render: () => renderWith({ addonQuantity: 5 }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// The total is stated rather than left for the customer to add up:
		// Pro at $299 plus 5 extra premium pairings at $5.
		await expect(await canvas.findByText("$324")).toBeVisible();
		// The breakdown is one line beside the total, so match within it.
		await expect(await canvas.findByText(/5 extra premium pairings/)).toBeVisible();
		// Pro tracks 150 prompts and includes 20 premium slots, so 5 purchased makes 25.
		await expect(await canvas.findByText("84 / 150")).toBeVisible();
		await expect(await canvas.findByText("12 / 25")).toBeVisible();
		// Pro includes two brands, so the meter has something to say.
		await expect(await canvas.findByText("1 / 2")).toBeVisible();
	},
};

/**
 * After a downgrade the guards stop new additions but never delete overage, so
 * a meter can read over its limit. The count turns destructive when it does.
 */
export const OverLimitAfterDowngrade: Story = {
	render: () =>
		renderWith({
			plan: "starter",
			periodEnd: new Date(NOW.getTime() + 12 * DAY_MS),
			usage: { brands: 3, enabledPrompts: 212, premiumAssigned: 0 },
		}),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// No add-on, so the total needs no breakdown. ($29 also appears on the
		// Starter card below, so the arithmetic is asserted in plans.test.ts.)
		await expect(canvas.queryByText(/extra premium prompt/)).toBeNull();
		await expect(await canvas.findByText("3 / 1")).toBeVisible();
		await expect(await canvas.findByText("212 / 50")).toBeVisible();
		// Starter has no premium pool, so that meter and the add-on card are absent.
		await expect(canvas.queryByText("Extra premium prompts")).toBeNull();
	},
};

/** past_due inside the dunning window: tracking continues, card needs fixing. */
export const PaymentFailedInGrace: Story = {
	render: () => renderWith({ status: "past_due", periodEnd: new Date(NOW.getTime() - 2 * DAY_MS) }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Payment failed")).toBeVisible();
	},
};

/** past_due beyond the grace window: tracking stops, data stays readable. */
export const TrackingPaused: Story = {
	render: () => renderWith({ status: "past_due", periodEnd: new Date(NOW.getTime() - 30 * DAY_MS) }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Tracking paused")).toBeVisible();
	},
};

/** Scheduled cancellation: still active until the period actually ends. */
export const CancellationScheduled: Story = {
	render: () =>
		renderWith({
			cancelAtPeriodEnd: true,
			billingInterval: "year",
			periodEnd: new Date(NOW.getTime() + 9 * DAY_MS),
		}),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/set to cancel on/i)).toBeVisible();
		await expect(await canvas.findByText(/annual billing/i)).toBeVisible();
	},
};

/** No subscription on file: the paywall state, with nothing to meter. */
export const NoSubscription: Story = {
	render: () => renderWith({ plan: null, usage: { brands: 0, enabledPrompts: 0, premiumAssigned: 0 } }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("No active subscription")).toBeVisible();
		await expect(await canvas.findByRole("button", { name: /choose a plan/i })).toBeVisible();
	},
};

/**
 * A contract org: `planOverride: "custom"` entitles it without any Stripe
 * subscription, so there is no plan to switch and no portal to open.
 */
export const CustomContractPlan: Story = {
	render: () =>
		renderWith({
			plan: null,
			overrides: { planOverride: "custom", maxPrompts: 1000, premiumPoolIncluded: 100 },
			usage: { brands: 4, enabledPrompts: 640, premiumAssigned: 71 },
		}),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Custom")).toBeVisible();
		await expect(await canvas.findByText(/billed outside self-serve/i)).toBeVisible();
		await expect(await canvas.findByText("640 / 1000")).toBeVisible();
		// A contract has no published price, so no total is invented for it.
		await expect(canvas.queryByRole("button", { name: /switch to/i })).toBeNull();
	},
};

/** A plain member sees the plan and usage but cannot change either. */
export const NonAdminMember: Story = {
	render: () => renderWith({ role: "member" }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/only organization admins can change the plan/i)).toBeVisible();
		await expect(canvas.queryByRole("button", { name: /manage billing/i })).toBeNull();
		// A member sees the plan and the total but is offered no way to change it.
		await expect(await canvas.findByText("$299")).toBeVisible();
		await expect(canvas.queryByRole("button", { name: /switch to/i })).toBeNull();
	},
};

/** Opening the Stripe portal is a redirect, so the button reports in-flight. */
export const OpeningBillingPortal: Story = {
	render: () => {
		setMockSubscriptionDelay(100_000);
		return renderWith();
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// The current plan's card carries the way in to Stripe.
		await userEvent.click(await canvas.findByRole("button", { name: /^manage$/i }));
		// Every other action disables while one is in flight.
		await expect(await canvas.findByRole("button", { name: /switch to starter/i })).toBeDisabled();
	},
};

/**
 * Shrinking the add-on below what is already assigned is refused server-side,
 * because the worker would otherwise stop running the newest assignments.
 */
export const AddOnReductionRefused: Story = {
	render: () => {
		setMockAddonError("12 prompts have Claude tracking assigned; unassign 2 before reducing the add-on");
		return renderWith({ addonQuantity: 5 });
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const quantity = await canvas.findByLabelText("Purchased pairings");
		await userEvent.clear(quantity);
		await userEvent.type(quantity, "3");
		await userEvent.click(await canvas.findByRole("button", { name: "Update" }));
		await expect(await canvas.findByText(/unassign 2 before reducing/i)).toBeVisible();
	},
};

/**
 * Every plan a switch could reach, with what it would get you stated row by
 * row. The plan already in force is marked and offers no button to press.
 */
export const ComparesPlansWithCurrentMarked: Story = {
	render: () => renderWith(),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// The badge marks the active plan; it carries no button to press.
		await expect(await canvas.findByText("Current")).toBeVisible();
		// Every other plan offers a switch.
		for (const name of ["Starter", "Basic", "Business"]) {
			await expect(await canvas.findByRole("button", { name: `Switch to ${name}` })).toBeEnabled();
		}
		await expect(canvas.queryByRole("button", { name: "Switch to Pro" })).toBeNull();
	},
};

/** Annual billing quotes the annual figure, not a monthly equivalent. */
export const AnnualBillingShowsAnnualTotal: Story = {
	render: () => renderWith({ billingInterval: "year", addonQuantity: 2 }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Pro annual is 10x monthly ($2,990) plus 2 add-ons at $50 a year.
		await expect(await canvas.findByText("$3,090")).toBeVisible();
		await expect(await canvas.findByText(/annual billing/i)).toBeVisible();
	},
};
