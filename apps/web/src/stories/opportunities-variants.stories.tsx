/**
 * Two alternative designs for the Opportunities page, for evaluation:
 *   A — Priority worklist (operator's to-do list, gap bars)
 *   B — Competitor battlefield (who's beating you, and where)
 * Rendered with the same mock opportunities as the current page so they can be
 * compared side by side. B needs a per-prompt lead competitor, assigned here.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { OpportunitiesWorklist } from "@/components/opportunities-worklist";
import { OpportunitiesBattlefield, type OpportunityWithLead } from "@/components/opportunities-battlefield";
import { OpportunitiesSources, type SourceTarget } from "@/components/opportunities-sources";
import { OpportunitiesMomentum, type OpportunityWithTrend } from "@/components/opportunities-momentum";
import { mockOpportunities } from "./analytics-fixtures";

// Mock per-prompt lead competitor (the real version derives this from per-prompt
// competitor mentions). Globex leads the most → biggest threat.
const LEAD: Record<string, string> = {
	p1: "Globex",
	p2: "Initech",
	p3: "Globex",
	p4: "Globex",
	p5: "Initech",
	p6: "Umbrella",
};
const withLead: OpportunityWithLead[] = mockOpportunities.prompts.map((p) => ({
	...p,
	leadCompetitor: LEAD[p.promptId] ?? "Globex",
}));

// C — mock cited domains across the opportunity prompts (real version: aggregate
// the citations table over those prompts; "covered" = your domain appears).
const SOURCE_TARGETS: SourceTarget[] = [
	{ domain: "g2.com", prompts: 9, covered: false },
	{ domain: "reddit.com", prompts: 7, covered: true },
	{ domain: "capterra.com", prompts: 6, covered: false },
	{ domain: "techradar.com", prompts: 5, covered: false },
	{ domain: "trustradius.com", prompts: 4, covered: true },
	{ domain: "pcmag.com", prompts: 3, covered: false },
	{ domain: "getapp.com", prompts: 2, covered: false },
];

// D — mock 30-day trend per opening (real version: per-prompt mention-rate slope).
const TREND: Record<string, { delta: number; spark: number[] }> = {
	p1: { delta: -12, spark: [17, 15, 12, 9, 7, 5] },
	p2: { delta: 6, spark: [6, 7, 8, 10, 11, 12] },
	p3: { delta: -4, spark: [22, 21, 21, 20, 19, 18] },
	p4: { delta: 9, spark: [22, 24, 26, 28, 30, 31] },
	p5: { delta: -7, spark: [51, 50, 48, 47, 45, 44] },
	p6: { delta: 3, spark: [25, 26, 26, 27, 28, 28] },
};
const withTrend: OpportunityWithTrend[] = mockOpportunities.prompts
	.filter((p) => p.tier === "high" || p.tier === "medium" || p.tier === "low")
	.map((p) => ({ ...p, ...(TREND[p.promptId] ?? { delta: 0, spark: [] }) }));

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased min-h-svh w-full max-w-[1100px] mx-auto p-4 md:p-6">
				{children}
			</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Pages/Opportunities Variants",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const A_Worklist: StoryObj = {
	name: "A — Priority worklist",
	render: () => (
		<Shell>
			<OpportunitiesWorklist prompts={mockOpportunities.prompts} />
		</Shell>
	),
};

export const B_Battlefield: StoryObj = {
	name: "B — Competitor battlefield",
	render: () => (
		<Shell>
			<OpportunitiesBattlefield prompts={withLead} />
		</Shell>
	),
};

export const C_Sources: StoryObj = {
	name: "C — Source targets",
	render: () => (
		<Shell>
			<OpportunitiesSources sources={SOURCE_TARGETS} />
		</Shell>
	),
};

export const D_Momentum: StoryObj = {
	name: "D — Momentum",
	render: () => (
		<Shell>
			<OpportunitiesMomentum prompts={withTrend} />
		</Shell>
	),
};
