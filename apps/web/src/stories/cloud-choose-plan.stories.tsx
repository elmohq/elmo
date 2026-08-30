/**
 * Stories for /choose-plan — the checkout-first paywall a cloud org lands on
 * with no active subscription.
 *
 * The plan cards render straight from the plan catalog, so these stories are
 * also the fastest way to see a pricing or limit change: edit
 * packages/config/src/plans.ts and the cards follow.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { PLAN_KEYS, PLANS, PLATFORM_TIER_LABELS, PREMIUM_RUNS_PER_DAY } from "@workspace/config/plans";
import type { ComponentType, ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Route } from "@/routes/_authed/choose-plan";
import type { PaywallRequired } from "@/server/billing";
import { getMockSubscriptionCalls, resetMockAuthClient, setMockSubscriptionError } from "./_mocks/auth-client";
import { setMockLoaderData, setMockSearch } from "./_mocks/tanstack-router";

const ChoosePlanPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

const NEEDS_PLAN: PaywallRequired = {
	needsPlan: true,
	organizationId: "org-1",
	organizationName: "Acme",
	isOrgAdmin: true,
};

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh">{children}</div>;
}

const meta = {
	title: "Cloud/Choose Plan",
	component: ChoosePlanPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			resetMockAuthClient();
			setMockSearch({});
			setMockLoaderData(NEEDS_PLAN);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof ChoosePlanPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Monthly pricing, every self-serve plan, Pro marked as popular. */
export const MonthlyPricing: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const key of PLAN_KEYS) {
			await expect(await canvas.findByRole("button", { name: `Subscribe to ${PLANS[key].name}` })).toBeEnabled();
		}
		await expect(await canvas.findByText(`$${PLANS.pro.monthlyPriceUsd.toLocaleString()}`)).toBeVisible();
		await expect(await canvas.findByText("Popular")).toBeVisible();
	},
};

/**
 * Every plan states each fact once, in a row the plans differ across — so the
 * three tiers, and the rates that separate them, are named a single time rather
 * than reprinted on all four cards.
 */
export const ComparesPlansAcrossSharedRows: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		// One heading per tier for the whole table, not one per plan.
		for (const label of [PLATFORM_TIER_LABELS.scraped, PLATFORM_TIER_LABELS.api, PLATFORM_TIER_LABELS.premium]) {
			await expect(await canvas.findByText(label)).toBeVisible();
		}

		// Picks run at the plan's rate, while the premium tier states its own rate
		// beside the tier it belongs to; a single number would blur that distinction.
		await expect((await canvas.findAllByText(`${PLANS.pro.standardRunsPerDay}×/day`)).length).toBeGreaterThan(1);
		await expect((await canvas.findAllByText(`${PREMIUM_RUNS_PER_DAY}×/day`)).length).toBeGreaterThan(0);

		// The premium tier names the grounded product, not the pick.
		await expect(await canvas.findByText("GPT-5 Search")).toBeVisible();

		// Limits read off the catalog rather than being restated in prose.
		await expect(await canvas.findByText("Tracked prompts")).toBeVisible();
		await expect(await canvas.findByText(String(PLANS.business.maxPrompts))).toBeVisible();
	},
};

/**
 * A plan that doesn't sell something says so in the same row that another plan
 * fills in, so the gap between two plans is readable across rather than by
 * holding one card in your head while you scroll to the next.
 */
export const ShowsWhatEachPlanOmits: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Premium is sold on two of the four plans, so its rows carry two ticks
		// and two dashes apiece.
		const included = await canvas.findAllByLabelText("Included");
		const excluded = await canvas.findAllByLabelText("Not included");
		await expect(included.length).toBeGreaterThan(0);
		await expect(excluded.length).toBeGreaterThan(0);
		// Starter sells one scraped platform, so the API and premium tiers are
		// dashes down its whole column.
		await expect(await canvas.findByText(`${PLANS.pro.premiumIncluded} prompt/model pairings`)).toBeVisible();
	},
};

/** Flipping to annual swaps every price for the 10x (two months free) rate. */
export const AnnualPricing: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("switch", { name: /annual billing/i }));
		await expect(await canvas.findByText(`$${PLANS.business.annualPriceUsd.toLocaleString()}`)).toBeVisible();
		// Every column switches interval together, not just the one being read.
		await expect(await canvas.findAllByText("/yr")).toHaveLength(PLAN_KEYS.length);
	},
};

/** Checkout hands the plan key and the annual flag to better-auth's Stripe plugin. */
export const StartsCheckout: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("switch", { name: /annual billing/i }));
		await userEvent.click(await canvas.findByRole("button", { name: "Subscribe to Business" }));
		await expect(getMockSubscriptionCalls()).toHaveLength(1);
		await expect(getMockSubscriptionCalls()[0].args).toMatchObject({
			plan: "business",
			annual: true,
			referenceId: "org-1",
			customerType: "organization",
		});
	},
};

/** A failed checkout leaves the page usable and reports why. */
export const CheckoutError: Story = {
	render: () => {
		setMockSubscriptionError("Your card was declined");
		return <ChoosePlanPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Subscribe to Pro" }));
		await expect(await canvas.findByText("Your card was declined")).toBeVisible();
		await expect(await canvas.findByRole("button", { name: "Subscribe to Pro" })).toBeEnabled();
	},
};

export const NonAdminMember: Story = {
	render: () => {
		setMockLoaderData({ ...NEEDS_PLAN, isOrgAdmin: false });
		return <ChoosePlanPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/only an organization admin can choose a plan/i)).toBeVisible();
		await expect(await canvas.findByRole("button", { name: "Subscribe to Pro" })).toBeDisabled();
	},
};

/**
 * Returning from Stripe Checkout: the subscription only exists once the webhook
 * lands, so the page waits rather than dropping the user into an unentitled app.
 */
export const ActivatingAfterCheckout: Story = {
	render: () => {
		setMockSearch({ status: "success" });
		return <ChoosePlanPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/activating your organization/i)).toBeVisible();
		await expect(canvas.queryByRole("button", { name: "Subscribe to Pro" })).toBeNull();
	},
};
