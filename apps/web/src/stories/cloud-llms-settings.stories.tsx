import type { Meta, StoryObj } from "@storybook/react";
import { PROVIDERS_DOCS_URL } from "@workspace/config/constants";
import { PLATFORM_TIER_LABELS, STANDARD_PLATFORM_MENU } from "@workspace/config/plans";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { platformGroupCopy } from "@/lib/platform-groups";
import { Route } from "@/routes/_authed/app/org/$org/brand/$brand/settings/llms";
import type { ModelPickerState, PlatformOption } from "@/server/platform-picks";
import type { PremiumPool } from "@/server/premium-tracking";
import { setMockLoaderData } from "./_mocks/tanstack-router";

const LlmsSettingsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

/**
 * A realistic cloud instance: scraped consumer surfaces for the big engines,
 * OpenRouter for the open-weight models, and both Claude variants — ungrounded
 * is pickable, grounded belongs to the pool.
 */
const CLOUD_TARGETS = parseScrapeTargets(
	[
		"chatgpt:brightdata:online",
		"google-ai-mode:brightdata:online",
		"google-ai-overview:dataforseo:online",
		"copilot:brightdata:online",
		"perplexity:brightdata:online",
		"gemini:brightdata:online",
		"qwen:openrouter:qwen/qwen3-235b-a22b",
		"deepseek:openrouter:deepseek/deepseek-v3.2",
		"grok:openrouter:x-ai/grok-4.5",
		"mistral:openrouter:mistralai/mistral-medium-3.1",
		"claude:anthropic-api:claude-sonnet-5",
		"claude:anthropic-api:claude-sonnet-5:online",
	].join(","),
);

/** Mirrors the server's classification without importing the provider registry. */
const SCRAPERS = new Set(["brightdata", "olostep", "oxylabs", "cloro", "dataforseo"]);

/** The display names describeProvider() returns for these ids. */
const PROVIDER_NAMES: Record<string, string> = {
	brightdata: "BrightData",
	dataforseo: "DataForSEO",
	openrouter: "OpenRouter",
	"anthropic-api": "Anthropic",
};

/** Mirrors the shared per-provider estimates the server stamps onto options. */
const COST_PER_RUN_USD: Record<string, number> = {
	brightdata: 0.01,
	dataforseo: 0.005,
	openrouter: 0.005,
	"anthropic-api": 0.015,
};

/**
 * Mirrors the server's `forOperator` split: a customer's payload carries the
 * platform and how it is reached, but never which vendor serves it or what it
 * costs us.
 */
function toOption(config: (typeof CLOUD_TARGETS)[number], forOperator = false): PlatformOption {
	// DataForSEO scrapes unless a target pins a model version, same as the server.
	const scraped = SCRAPERS.has(config.provider) && !(config.provider === "dataforseo" && config.version);
	const base = COST_PER_RUN_USD[config.provider] ?? null;
	const shared = {
		model: config.model,
		webSearch: config.webSearch,
		access: scraped ? ("scraped" as const) : ("api" as const),
	};
	if (!forOperator) return { ...shared, costPerRunUsd: null };
	return {
		...shared,
		providerName: PROVIDER_NAMES[config.provider] ?? config.provider,
		version: config.version,
		costPerRunUsd: base === null ? null : base + (config.provider === "anthropic-api" && config.webSearch ? 0.01 : 0),
	};
}

/** One option per model, matching the server. Cloud drops grounded targets, which
 *  are a pooled allowance rather than a pick. */
function optionsByModel(forOperator = false, { excludePremium = true } = {}): PlatformOption[] {
	const seen = new Set<string>();
	const out: PlatformOption[] = [];
	for (const config of CLOUD_TARGETS) {
		const option = toOption(config, forOperator);
		// A grounded API call is the premium tier, sold from the pool.
		if (excludePremium && option.access === "api" && option.webSearch) continue;
		if (seen.has(config.model)) continue;
		seen.add(config.model);
		out.push(option);
	}
	return out;
}

const PICKABLE = optionsByModel();

function menuOptions(menu: readonly string[]): PlatformOption[] {
	const allowed = new Set(menu);
	return PICKABLE.filter((option) => allowed.has(option.model));
}

// From the catalog, so a renamed tier fails here rather than drifting.
const CARD_TITLES = PLATFORM_TIER_LABELS;

const NO_PREMIUM_POOL: PremiumPool = { available: false, assigned: 0, total: 0 };

function loader(picker: ModelPickerState, premium: PremiumPool = NO_PREMIUM_POOL) {
	setMockLoaderData({ picker, premium });
}

/** A standard cloud plan: the full menu, four picks. */
function standardPicker(overrides: Partial<ModelPickerState> = {}): ModelPickerState {
	return {
		available: menuOptions(STANDARD_PLATFORM_MENU),
		editable: true,
		enabledModels: ["chatgpt", "google-ai-mode", "perplexity", "claude"],
		planLimits: { platformPicks: 4, platformMenu: [...STANDARD_PLATFORM_MENU] },
		upgradeOptions: [],
		costBasis: null,
		unconfiguredPlatforms: [],
		...overrides,
	};
}

/** No plan menu, no pick count, and every configured target tracked. */
function unmeteredPicker(available: PlatformOption[], overrides: Partial<ModelPickerState> = {}): ModelPickerState {
	return {
		available,
		editable: true,
		enabledModels: available.map((option) => option.model),
		planLimits: null,
		upgradeOptions: [],
		costBasis: null,
		unconfiguredPlatforms: [],
		...overrides,
	};
}

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">{children}</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Cloud/LLM Settings",
	component: LlmsSettingsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<Shell>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof LlmsSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A 4-pick plan with all four spent, one of them Claude. Every unchecked
 * platform is disabled until one is freed, and each row states how it is
 * reached.
 */
export const CloudAtPickLimit: Story = {
	render: () => {
		loader(standardPicker(), { available: true, assigned: 6, total: 20 });
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("4 / 4 picks")).toBeVisible();
		// Scraped engines and API models are separate cards, not pills in one grid.
		await expect(await canvas.findByText(CARD_TITLES.scraped)).toBeVisible();
		await expect(await canvas.findByText(CARD_TITLES.api)).toBeVisible();
		await expect(await canvas.findByRole("checkbox", { name: /claude/i })).toBeChecked();
		await expect(await canvas.findByRole("checkbox", { name: /mistral/i })).toHaveAttribute("aria-disabled", "true");
	},
};

/**
 * The point of grouping: what scraped and API tracking actually mean is on the
 * page, not behind a hover. Both descriptions should be readable without any
 * interaction.
 */
export const GroupDescriptionsAreVisible: Story = {
	render: () => {
		loader(standardPicker());
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Read from the catalog rather than pinning the wording, so editing the
		// copy is a copy change and not a test failure.
		await expect(await canvas.findByText(platformGroupCopy("scraped").description)).toBeVisible();
		await expect(await canvas.findByText(platformGroupCopy("api").description)).toBeVisible();
	},
};

/** Freeing a pick re-enables the rest, and only then does Save become live. */
export const CloudSwappingAPlatform: Story = {
	render: () => {
		loader(standardPicker());
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Nothing to save until something changes; the bar only appears then.
		await expect(canvas.queryByRole("button", { name: /save changes/i })).toBeNull();

		await userEvent.click(await canvas.findByRole("checkbox", { name: /claude/i }));
		await expect(await canvas.findByText("3 / 4 picks")).toBeVisible();

		const mistral = await canvas.findByRole("checkbox", { name: /mistral/i });
		await expect(mistral).not.toHaveAttribute("aria-disabled", "true");
		await userEvent.click(mistral);
		await expect(await canvas.findByText("4 / 4 picks")).toBeVisible();
		await expect(await canvas.findByRole("button", { name: /save changes/i })).toBeEnabled();
	},
};

/**
 * Starter tracks one platform, so there is nothing to choose: the page says what
 * is tracked and what upgrading would add, rather than showing a lone checkbox.
 */
export const StarterSinglePlatform: Story = {
	render: () => {
		loader({
			available: menuOptions(["chatgpt"]),
			// One pick, one platform: the server reports nothing to change.
			editable: false,
			enabledModels: ["chatgpt"],
			planLimits: { platformPicks: 1, platformMenu: ["chatgpt"] },
			upgradeOptions: PICKABLE.filter((option) => option.model !== "chatgpt"),
			costBasis: null,
			unconfiguredPlatforms: [],
		});
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// The tier names the card and also groups the upgrade options below it.
		await expect((await canvas.findAllByText(CARD_TITLES.scraped)).length).toBeGreaterThan(0);
		await expect(await canvas.findByText("ChatGPT")).toBeVisible();
		await expect(canvas.queryByRole("checkbox")).toBeNull();
		await expect(await canvas.findByText(/upgrade to track more platforms/i)).toBeVisible();
		await expect(await canvas.findByRole("button", { name: /compare plans/i })).toBeVisible();
	},
};

/** A mid-tier plan keeps the picker but still names what a higher plan adds. */
export const UpgradeableMidPlan: Story = {
	render: () => {
		const menu = ["chatgpt", "google-ai-mode", "perplexity", "claude"];
		loader({
			available: menuOptions(menu),
			editable: true,
			enabledModels: ["chatgpt", "claude"],
			planLimits: { platformPicks: 4, platformMenu: menu },
			upgradeOptions: PICKABLE.filter((option) => !menu.includes(option.model)),
			costBasis: null,
			unconfiguredPlatforms: [],
		});
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Grouped chips rather than one wrapped sentence of names.
		await expect(await canvas.findByText(/upgrade to track more platforms/i)).toBeVisible();
		await expect(await canvas.findByText("Grok")).toBeVisible();
		await expect(await canvas.findByRole("button", { name: /compare plans/i })).toBeVisible();
	},
};

/**
 * Unlimited entitlements — local and whitelabel alike: no plan, no cap, no
 * upgrade path, and grounded Claude is offerable too since there is no pool
 * reserving it for a per-prompt allowance.
 */
export const UnlimitedPicks: Story = {
	render: () => {
		loader(unmeteredPicker(optionsByModel(false, { excludePremium: false })));
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText(/picks$/)).toBeNull();
		await expect(canvas.queryByText(/upgrade to track more platforms/i)).toBeNull();
		// Both cards render; picks are stored by model name, so Claude appears once
		// even when the instance configures a grounded target too.
		await expect(await canvas.findByText(CARD_TITLES.scraped)).toBeVisible();
		await expect(await canvas.findAllByRole("checkbox", { name: /claude/i })).toHaveLength(1);
	},
};

/** No targets configured at all: the page says so instead of an empty grid. */
export const NoTargetsConfigured: Story = {
	render: () => {
		loader(unmeteredPicker([], { editable: false }));
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/not tracked on any platform yet/i)).toBeVisible();
		await expect(canvas.queryByText(/SCRAPE_TARGETS/)).toBeNull();
	},
};

/** The grounded Claude allowance with room left, and where to spend or grow it. */
export const PremiumPoolWithRoom: Story = {
	render: () => {
		loader(standardPicker(), { available: true, assigned: 6, total: 20 });
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(CARD_TITLES.premium)).toBeVisible();
		await expect(await canvas.findByText("6 / 20 pairings")).toBeVisible();
		await expect(await canvas.findByText(/14 of 20 pairings still available/i)).toBeVisible();
		// Assignment happens in the prompts editor, not here.
		await expect(await canvas.findByRole("button", { name: /choose prompts/i })).toBeVisible();
		await expect(await canvas.findByRole("button", { name: /change how many/i })).toBeVisible();
		await expect(canvas.queryByText(/best crm/i)).toBeNull();
	},
};

/** A full allowance says how to free one up rather than silently capping. */
export const PremiumPoolExhausted: Story = {
	render: () => {
		loader(standardPicker(), { available: true, assigned: 20, total: 20 });
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("20 / 20 pairings")).toBeVisible();
		await expect(await canvas.findByText(/all 20 pairings are in use/i)).toBeVisible();
	},
};

/** A plan with no grounded allowance simply omits the card. */
export const NoClaudeAllowance: Story = {
	render: () => {
		loader(standardPicker());
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText(CARD_TITLES.premium)).toBeNull();
		// Ungrounded Claude is still pickable as a platform.
		await expect(await canvas.findByRole("checkbox", { name: /claude/i })).toBeChecked();
	},
};

/**
 * Self-hosted operators pay the providers directly, so their tooltips carry a
 * per-run estimate and what it comes to per month at this brand's prompt count
 * and cadence. Cloud and whitelabel omit it: the person looking pays a plan
 * price, not the bills.
 */
export const SelfHostedShowsCostEstimates: Story = {
	render: () => {
		loader(
			unmeteredPicker(optionsByModel(true, { excludePremium: false }), {
				costBasis: { enabledPrompts: 40, runsPerDay: 1, replication: 5 },
			}),
		);
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// A row states its unit price and vendor, stated rather than hidden behind
		// a hover. The monthly figure is the page's, not the row's.
		await expect((await canvas.findAllByText(/≈\$0\.010\/run · BrightData/)).length).toBeGreaterThan(0);
		await expect(canvas.queryByText(/\/mo here/)).toBeNull();

		// Every configured platform is on, so the total is the whole bill: 40
		// prompts x 1/day x 5 calls x 30 days against each platform's unit price.
		await expect(await canvas.findByText(/≈\$\d[\d,]*\/mo/)).toBeVisible();
	},
};

/** Unticking a platform quotes the bill it would leave behind, before saving. */
export const SelfHostedTotalFollowsTheSelection: Story = {
	render: () => {
		loader(
			unmeteredPicker(optionsByModel(true, { excludePremium: false }), {
				costBasis: { enabledPrompts: 40, runsPerDay: 1, replication: 5 },
			}),
		);
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// BrightData at $0.01/run over 40 prompts x 1/day x 5 calls x 30 days is $60,
		// so dropping Copilot should quote a smaller bill than the page total.
		await userEvent.click(await canvas.findByRole("checkbox", { name: /copilot/i }));
		const bar = await canvas.findByText(/platforms selected · ≈\$[\d,.]+\/mo, down from \$[\d,.]+/);
		await expect(bar).toBeVisible();

		const [next, saved] = (bar.textContent ?? "").match(/\$([\d,.]+)/g) ?? [];
		await expect(Number(next?.replace(/[$,]/g, ""))).toBeLessThan(Number(saved?.replace(/[$,]/g, "")));
	},
};

/** Cloud hides the estimates entirely — they are internal attribution figures. */
export const CloudHidesCostEstimates: Story = {
	render: () => {
		loader(standardPicker(), { available: true, assigned: 6, total: 20 });
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// The grouping still explains itself, without disclosing cost or vendor.
		await expect(await canvas.findByText(/what a real visitor sees/i)).toBeVisible();
		await expect(canvas.queryByText(/\/run/)).toBeNull();
		await expect(canvas.queryByText(/brightdata/i)).toBeNull();
	},
};

/**
 * Self-hosted instances rarely configure everything, so the page names what else
 * Elmo can track and which provider account each one needs, linking straight to
 * that provider's section of the setup guide.
 */
export const SelfHostedSuggestsMorePlatforms: Story = {
	render: () => {
		// A minimal instance: only ChatGPT via BrightData.
		const configured = CLOUD_TARGETS.filter((t) => t.model === "chatgpt");
		loader(
			unmeteredPicker(
				configured.map((config) => toOption(config, true)),
				{
					costBasis: { enabledPrompts: 12, runsPerDay: 1, replication: 5 },
					unconfiguredPlatforms: [
						{
							// Reachable either way, and the two are not equivalent.
							model: "perplexity",
							providers: [
								{
									id: "brightdata",
									name: "BrightData",
									access: "scraped",
									docsUrl: `${PROVIDERS_DOCS_URL}#brightdata`,
								},
								{ id: "oxylabs", name: "Oxylabs", access: "scraped", docsUrl: `${PROVIDERS_DOCS_URL}#oxylabs` },
								{
									id: "openrouter",
									name: "OpenRouter",
									access: "api",
									docsUrl: `${PROVIDERS_DOCS_URL}#direct-model-apis`,
								},
							],
						},
						{
							model: "claude",
							providers: [
								{
									id: "anthropic-api",
									name: "Anthropic",
									access: "api",
									docsUrl: `${PROVIDERS_DOCS_URL}#direct-model-apis`,
								},
							],
						},
						{
							model: "copilot",
							providers: [
								{
									id: "brightdata",
									name: "BrightData",
									access: "scraped",
									docsUrl: `${PROVIDERS_DOCS_URL}#brightdata`,
								},
							],
						},
					],
				},
			),
		);
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Track more platforms")).toBeVisible();
		// Scrapers and APIs are separate columns, since they return different data.
		await expect(await canvas.findByText("Scrapers")).toBeVisible();
		await expect(await canvas.findByText("Direct APIs")).toBeVisible();
		// Claude has no scraper and Copilot has no API, so each shows a gap.
		await expect((await canvas.findAllByText("—")).length).toBe(2);

		// Provider names link into their own section of the setup guide.
		await expect(await canvas.findByRole("link", { name: "Anthropic" })).toHaveAttribute(
			"href",
			`${PROVIDERS_DOCS_URL}#direct-model-apis`,
		);
		await expect((await canvas.findAllByRole("link", { name: "BrightData" }))[0]).toHaveAttribute(
			"href",
			`${PROVIDERS_DOCS_URL}#brightdata`,
		);
		await expect(await canvas.findByRole("link", { name: /provider setup guide/i })).toBeVisible();
	},
};

/** Cloud never shows it: SCRAPE_TARGETS is the operator's concern, not a customer's. */
export const CloudHidesPlatformSuggestions: Story = {
	render: () => {
		loader(standardPicker());
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText("Track more platforms")).toBeNull();
	},
};

/**
 * Whitelabel is the case the mode gates exist for. It resolves the same
 * unlimited entitlements as local — but the person looking is the agency's
 * *customer*, not the operator. So the cost estimates, the platform suggestions
 * and the picks themselves all stay the agency's.
 *
 * This pins the rendering half of that — it can't catch the server gates
 * themselves widening, since the server function is mocked here.
 */
export const Whitelabel: Story = {
	render: () => {
		loader({
			available: optionsByModel(false, { excludePremium: false }),
			editable: false,
			enabledModels: ["chatgpt", "perplexity", "claude"],
			planLimits: null,
			upgradeOptions: [],
			costBasis: null,
			unconfiguredPlatforms: [],
		});
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole("checkbox")).toBeNull();
		await expect(canvas.queryByRole("button", { name: /save changes/i })).toBeNull();
		await expect(await canvas.findByText(CARD_TITLES.scraped)).toBeVisible();
		await expect(await canvas.findByText("ChatGPT")).toBeVisible();

		// Operator detail withheld, like cloud.
		await expect(canvas.queryByText("Track more platforms")).toBeNull();
		await expect(canvas.queryByText(/\/run/)).toBeNull();
		await expect(canvas.queryByText(/brightdata/i)).toBeNull();

		// No plan means no grounded Claude pool to report.
		await expect(canvas.queryByText(CARD_TITLES.premium)).toBeNull();
	},
};

/** Demo refuses every write, so the page reports the same way whitelabel does. */
export const DemoIsNotEditable: Story = {
	render: () => {
		loader({
			available: optionsByModel(false, { excludePremium: false }),
			editable: false,
			enabledModels: ["chatgpt", "perplexity"],
			planLimits: null,
			upgradeOptions: [],
			costBasis: null,
			unconfiguredPlatforms: [],
		});
		return <LlmsSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole("checkbox")).toBeNull();
		await expect(await canvas.findByText("ChatGPT")).toBeVisible();
		await expect(await canvas.findByText("Perplexity")).toBeVisible();
		// Configured but not tracked — listing it would imply it could be turned on.
		await expect(canvas.queryByText("Grok")).toBeNull();
	},
};
