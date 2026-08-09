/**
 * Stories for /choose-plan — the checkout-first paywall a cloud org lands on
 * with no active subscription.
 *
 * The plan cards render straight from the plan catalog, so these stories are
 * also the fastest way to see a pricing or limit change: edit
 * packages/config/src/plans.ts and the cards follow.
 */
import type { Meta, StoryObj } from "@storybook/react";
import {
	PLAN_KEYS,
	PLANS,
	PLATFORM_TIER_LABELS,
	PREMIUM_RUNS_PER_DAY,
	planPlatformBreakdown,
} from "@workspace/config/plans";
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
 * The rate a plan quotes covers its scraped surfaces; Claude runs once a day on
 * every plan because it is billed per API call. Quoting one number for both
 * would overstate Claude fourfold on Pro.
 */
export const SamplingQuotedPerPlatformGroup: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Three tiers, with Claude's API inside the pick budget rather than beside
		// it — the thing the old single-rate card got wrong.
		await expect((await canvas.findAllByText("Choose any 4 platforms")).length).toBeGreaterThan(0);
		await expect((await canvas.findAllByText("Scraped Engines")).length).toBeGreaterThan(0);
		await expect((await canvas.findAllByText("LLM APIs")).length).toBeGreaterThan(0);
		// Picks run at the plan's rate; only the premium tier departs from it.
		await expect((await canvas.findAllByText(`${PLANS.pro.standardRunsPerDay}×/day`)).length).toBeGreaterThan(0);
		await expect((await canvas.findAllByText(`${PREMIUM_RUNS_PER_DAY}×/day`)).length).toBeGreaterThan(0);

		// The premium tier names the grounded product, not the pick.
		await expect((await canvas.findAllByText("GPT-5 Search")).length).toBeGreaterThan(0);

		// Grounded Claude is metered where it is sold, and absent where it is not.
		// The sentence comes from the catalog, so this page and the marketing table
		// cannot word the same plan differently.
		await expect(
			await canvas.findByText(planPlatformBreakdown(PLANS.pro).premium?.summary ?? "missing summary"),
		).toBeVisible();
		await expect(canvas.queryByText(/not included on this plan/i)).toBeNull();
		// Pro and Business sell it; Starter and Basic do not.
		await expect(await canvas.findAllByText(PLATFORM_TIER_LABELS.premium)).toHaveLength(2);

		// Starter has one scraped platform and no API tier.
		await expect(await canvas.findByText("ChatGPT only")).toBeVisible();
	},
};

/** Flipping to annual swaps every price for the 10x (two months free) rate. */
export const AnnualPricing: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("switch", { name: /annual billing/i }));
		await expect(await canvas.findByText(`$${PLANS.business.annualPriceUsd.toLocaleString()}`)).toBeVisible();
		// Every card switches interval together, not just the one being read.
		await expect(await canvas.findAllByText("/year")).toHaveLength(PLAN_KEYS.length);
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

/**
 * Only an org admin can put a card on file. A member who was invited into an
 * unsubscribed workspace is told who to ask instead of being given dead buttons.
 */
export const NonAdminMember: Story = {
	render: () => {
		setMockLoaderData({ ...NEEDS_PLAN, isOrgAdmin: false });
		return <ChoosePlanPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/only a workspace admin can choose a plan/i)).toBeVisible();
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
		await expect(await canvas.findByText(/activating your workspace/i)).toBeVisible();
		await expect(canvas.queryByRole("button", { name: "Subscribe to Pro" })).toBeNull();
	},
};
