import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { computeFanoutAnalysis, type FanoutBreakdownRow } from "@/lib/fanout-analysis";
import type { FanoutEngineStatus } from "@/lib/fanout-engine-status";
import { Route } from "@/routes/_authed/app/org/$org/brand/$brand/query-fan-out";
import type { QueryFanoutResponse } from "@/server/query-fanout";
import { setMockQueryFanout } from "./_mocks/server-query-fanout";
import { setMockBrand } from "./_mocks/use-brands";

const QueryFanoutPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

const brand = {
	id: "brand-1",
	name: "Acme",
	website: "https://acme.com",
	onboarded: true,
	enabled: true,
	prompts: [{ id: "p1", value: "best email finder", enabled: true }],
	earliestDataDate: "2026-08-10",
	delayOverrideHours: 24,
	trackedTargets: [],
};

const engine = (e: Partial<FanoutEngineStatus> & Pick<FanoutEngineStatus, "model" | "state">) =>
	({
		support: "supported",
		basis: "brand",
		searchRuns: 0,
		fanoutRuns: 0,
		firstFanoutAt: null,
		lastFanoutAt: null,
		searchRunsSinceLastFanout: 0,
		...e,
	}) as FanoutEngineStatus;

function response(
	engines: FanoutEngineStatus[],
	runs: { model: string; runs: number }[],
	breakdown: FanoutBreakdownRow[] = [],
): QueryFanoutResponse {
	const modelTotals = runs.map(({ model, runs }) => {
		const rows = breakdown.filter((r) => r.model === model);
		return {
			model,
			runs,
			fanout_runs: Math.min(runs, Math.ceil(rows.reduce((n, r) => n + r.count, 0) / 2)),
			total_queries: rows.reduce((n, r) => n + r.count, 0),
		};
	});
	const promptValues = new Map([
		["p1", "What is the best email finder?"],
		["p2", "best b2b email finder tools for sales teams"],
	]);
	const analysis = computeFanoutAnalysis(breakdown, modelTotals, promptValues, {
		promptRuns: new Map([
			["p1", 40],
			["p2", 36],
		]),
	});
	return {
		...analysis,
		brandName: "Acme",
		model: null,
		coverageRate: Math.round(analysis.coverageRate * 100),
		engines,
	};
}

const q = (prompt_id: string, model: string, query: string, count: number): FanoutBreakdownRow => ({
	prompt_id,
	model,
	query,
	count,
	brand_mentions: Math.floor(count / 3),
});

const cloroBreakdown = [
	q("p1", "chatgpt", "best email finder tools reviews pricing accuracy 2026", 14),
	q("p1", "chatgpt", "best email finder tools comparison Hunter Apollo Snov.io RocketReach 2026", 11),
	q("p2", "chatgpt", "best B2B email finder tools sales teams 2026 Apollo Hunter Cognism pricing", 12),
	q("p2", "chatgpt", "official B2B email finder tools Lusha Snov.io RocketReach pricing features", 9),
];

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
		(Story) => {
			setMockBrand(brand);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof QueryFanoutPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A brand created after ChatGPT on BrightData went quiet — what Findymail sees. */
export const NewBrandNothingExposed: Story = {
	decorators: [
		(Story) => {
			setMockQueryFanout(
				response(
					[
						engine({
							model: "chatgpt",
							state: "stopped",
							basis: "deployment",
							searchRuns: 2281,
							firstFanoutAt: "2026-08-10T00:00:00.000Z",
							lastFanoutAt: "2026-09-28T00:00:00.000Z",
							searchRunsSinceLastFanout: 34100,
						}),
						engine({
							model: "gemini",
							state: "unsupported",
							support: "unsupported",
							searchRuns: 2285,
						}),
						engine({
							model: "google-ai-mode",
							state: "unsupported",
							support: "unsupported",
							searchRuns: 1346,
						}),
					],
					[
						{ model: "chatgpt", runs: 2281 },
						{ model: "gemini", runs: 2285 },
						{ model: "google-ai-mode", runs: 1346 },
					],
				),
			);
			return <Story />;
		},
	],
};

/** A long-running brand: ChatGPT returned queries, then stopped on Sep 28. */
export const ChatGptStopped: Story = {
	decorators: [
		(Story) => {
			setMockQueryFanout(
				response(
					[
						engine({
							model: "chatgpt",
							state: "stopped",
							searchRuns: 11720,
							fanoutRuns: 1121,
							firstFanoutAt: "2026-08-11T00:00:00.000Z",
							lastFanoutAt: "2026-09-28T00:00:00.000Z",
							searchRunsSinceLastFanout: 3815,
						}),
						engine({
							model: "google-ai-overview",
							state: "unsupported",
							support: "unsupported",
							searchRuns: 11348,
						}),
						engine({
							model: "gemini",
							state: "unsupported",
							support: "unsupported",
							searchRuns: 8604,
						}),
						engine({
							model: "google-ai-mode",
							state: "unsupported",
							support: "unsupported",
							searchRuns: 3161,
						}),
						engine({ model: "perplexity", state: "none-yet", searchRuns: 106 }),
					],
					[
						{ model: "chatgpt", runs: 1650 },
						{ model: "google-ai-overview", runs: 1600 },
						{ model: "gemini", runs: 1210 },
						{ model: "google-ai-mode", runs: 450 },
					],
					[
						q("p1", "chatgpt", "best email finder tools 2026", 9),
						q("p1", "chatgpt", "email finder accuracy comparison", 6),
						q("p2", "chatgpt", "b2b email finder for sales teams pricing", 7),
					],
				),
			);
			return <Story />;
		},
	],
};

/** After moving ChatGPT to Cloro: queries flow again; Gemini still can't expose them. */
export const SwitchedToCloro: Story = {
	decorators: [
		(Story) => {
			setMockQueryFanout(
				response(
					[
						engine({
							model: "chatgpt",
							state: "available",
							searchRuns: 1840,
							fanoutRuns: 1490,
							firstFanoutAt: "2026-09-30T00:00:00.000Z",
							lastFanoutAt: "2026-10-19T00:00:00.000Z",
						}),
						engine({
							model: "gemini",
							state: "unsupported",
							support: "unsupported",
							searchRuns: 4100,
						}),
					],
					[
						{ model: "chatgpt", runs: 1840 },
						{ model: "gemini", runs: 1850 },
					],
					cloroBreakdown,
				),
			);
			return <Story />;
		},
	],
};
