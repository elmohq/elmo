import type { Meta, StoryObj } from "@storybook/react";
import { getFanoutSupport } from "@workspace/config/fanout-support";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { computeFanoutAnalysis, type FanoutBreakdownRow } from "@/lib/fanout-analysis";
import type { TrackedTarget } from "@/lib/model-filter";
import { Route } from "@/routes/_authed/app/org/$org/brand/$brand/query-fan-out";
import type { QueryFanoutResponse } from "@/server/query-fanout";
import { setMockQueryFanout } from "./_mocks/server-query-fanout";
import { setMockBrand } from "./_mocks/use-brands";

const QueryFanoutPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

function trackedTargets(scrapeTargets: string): TrackedTarget[] {
	return parseScrapeTargets(scrapeTargets).map((config) => ({
		value: config.model,
		model: config.model,
		premium: false,
		tier: "scraped",
		intervalHours: 24,
		replication: 1,
		...(config.webSearch ? { fanout: getFanoutSupport(config) } : {}),
	}));
}

function brand(scrapeTargets: string) {
	return {
		id: "brand-1",
		name: "Acme",
		website: "https://acme.com",
		onboarded: true,
		enabled: true,
		prompts: [{ id: "p1", value: "best email finder", enabled: true }],
		earliestDataDate: "2026-08-10",
		delayOverrideHours: 24,
		trackedTargets: trackedTargets(scrapeTargets),
	};
}

const q = (prompt_id: string, model: string, query: string, count: number): FanoutBreakdownRow => ({
	prompt_id,
	model,
	query,
	count,
	brand_mentions: Math.floor(count / 3),
});

function response(runs: { model: string; runs: number }[], breakdown: FanoutBreakdownRow[] = []): QueryFanoutResponse {
	const modelTotals = runs.map(({ model, runs }) => {
		const rows = breakdown.filter((r) => r.model === model);
		const total = rows.reduce((n, r) => n + r.count, 0);
		return { model, runs, fanout_runs: Math.min(runs, Math.ceil(total / 2)), total_queries: total };
	});
	const analysis = computeFanoutAnalysis(
		breakdown,
		modelTotals,
		new Map([
			["p1", "What is the best email finder?"],
			["p2", "best b2b email finder tools for sales teams"],
		]),
		{
			promptRuns: new Map([
				["p1", 40],
				["p2", 36],
			]),
		},
	);
	return { ...analysis, brandName: "Acme", model: null, coverageRate: Math.round(analysis.coverageRate * 100) };
}

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased flex min-h-svh flex-col">
				<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
			</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Pages/Query Fan-Out",
	component: QueryFanoutPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<Shell>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof QueryFanoutPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NothingExposed: Story = {
	decorators: [
		(Story) => {
			setMockBrand(
				brand(
					"chatgpt:brightdata:online,gemini:brightdata:online,google-ai-mode:brightdata:online,claude:openrouter:x",
				),
			);
			setMockQueryFanout(
				response([
					{ model: "chatgpt", runs: 2281 },
					{ model: "gemini", runs: 2285 },
					{ model: "google-ai-mode", runs: 1346 },
				]),
			);
			return <Story />;
		},
	],
};

export const SomeExposed: Story = {
	decorators: [
		(Story) => {
			setMockBrand(
				brand(
					"chatgpt:cloro:online,gemini:brightdata:online,google-ai-overview:brightdata:online,perplexity:searchapi:online",
				),
			);
			setMockQueryFanout(
				response(
					[
						{ model: "chatgpt", runs: 1840 },
						{ model: "gemini", runs: 1850 },
					],
					[
						q("p1", "chatgpt", "best email finder tools reviews pricing accuracy 2026", 14),
						q("p1", "chatgpt", "best email finder tools comparison Hunter Apollo Snov.io RocketReach 2026", 11),
						q("p2", "chatgpt", "best B2B email finder tools sales teams 2026 Apollo Hunter Cognism pricing", 12),
						q("p2", "chatgpt", "official B2B email finder tools Lusha Snov.io RocketReach pricing features", 9),
					],
				),
			);
			return <Story />;
		},
	],
};

export const NoSearchRunsYet: Story = {
	decorators: [
		(Story) => {
			setMockBrand(brand("chatgpt:cloro:online,gemini:cloro:online,google-ai-mode:cloro:online"));
			setMockQueryFanout(response([]));
			return <Story />;
		},
	],
};
