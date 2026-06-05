/**
 * Three full Opportunities page concepts — each composes several signals around
 * a distinct mindset for tackling AEO (vs the single-feature A–D variants):
 *   1 — Command center (triage: scorecard + worklist + sources)
 *   2 — Competitive battleground (standings + map + contest list)
 *   3 — Source & coverage strategy (coverage + source targets + earn/fix split)
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { OpportunitiesCommandCenter } from "@/components/opportunities-command-center";
import { OpportunitiesCommandCenterV2, type LeaderPrompt } from "@/components/opportunities-command-center-v2";
import { OpportunitiesCompetitive, type Standing } from "@/components/opportunities-competitive";
import { OpportunitiesSourceStrategy, type OpportunityWithCoverage } from "@/components/opportunities-source-strategy";
import type { OpportunityWithLead } from "@/components/opportunities-battlefield";
import type { SourceTarget } from "@/components/opportunities-sources";
import { mockOpportunities, mockShareOfVoice } from "./analytics-fixtures";

const SOURCE_TARGETS: SourceTarget[] = [
	{ domain: "g2.com", prompts: 9, covered: false },
	{ domain: "reddit.com", prompts: 7, covered: true },
	{ domain: "capterra.com", prompts: 6, covered: false },
	{ domain: "techradar.com", prompts: 5, covered: false },
	{ domain: "trustradius.com", prompts: 4, covered: true },
	{ domain: "pcmag.com", prompts: 3, covered: false },
];

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

const standings: Standing[] = mockShareOfVoice.entries.map((e) => ({ name: e.name, share: e.share, isBrand: e.isBrand }));

// Per-prompt best competitor (the benchmark) + the sources those answers cite.
const LEADER: Record<string, { name: string; rate: number; sources: string[] }> = {
	p1: { name: "Globex", rate: 0.68, sources: ["g2.com", "reddit.com", "capterra.com"] },
	p2: { name: "Initech", rate: 0.64, sources: ["techradar.com", "g2.com"] },
	p3: { name: "Globex", rate: 0.52, sources: ["capterra.com", "nerdwallet.com"] },
	p4: { name: "Globex", rate: 0.5, sources: ["g2.com", "getapp.com"] },
	p5: { name: "Initech", rate: 0.47, sources: ["pcmag.com", "techradar.com"] },
	p6: { name: "Umbrella", rate: 0.31, sources: ["reddit.com", "capterra.com"] },
	p7: { name: "Globex", rate: 0.55, sources: ["g2.com", "hubspot.com"] },
	p8: { name: "Globex", rate: 0.48, sources: ["g2.com", "reddit.com"] },
};
const withLeader: LeaderPrompt[] = mockOpportunities.prompts
	.filter((p) => p.tier !== "none")
	.map((p) => ({
		...p,
		leader: { name: LEADER[p.promptId]?.name ?? "—", rate: LEADER[p.promptId]?.rate ?? 0 },
		sources: LEADER[p.promptId]?.sources ?? [],
	}));

const CITED: Record<string, boolean> = { p1: false, p2: false, p3: true, p4: false, p5: true, p6: true };
const withCoverage: OpportunityWithCoverage[] = mockOpportunities.prompts.map((p) => ({
	...p,
	youCited: CITED[p.promptId] ?? false,
}));

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			{/* Fixed width so the Storybook canvas (which shrink-wraps) renders the
			    desktop layout; the real route would just use its container width. */}
			<div className="bg-background text-foreground antialiased min-h-svh w-[1120px] p-4 md:p-6">{children}</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Pages/Opportunities Pages",
	parameters: { layout: "fullscreen" },
	decorators: [(Story) => <Shell>{<Story />}</Shell>],
} satisfies Meta;

export default meta;

export const CommandCenter: StoryObj = {
	name: "1 — Command center",
	render: () => <OpportunitiesCommandCenter prompts={mockOpportunities.prompts} sources={SOURCE_TARGETS} />,
};

export const CommandCenterRefined: StoryObj = {
	name: "1b — Command center (leader-benchmarked)",
	render: () => <OpportunitiesCommandCenterV2 prompts={withLeader} />,
};

export const Competitive: StoryObj = {
	name: "2 — Competitive battleground",
	render: () => <OpportunitiesCompetitive prompts={withLead} standings={standings} />,
};

export const SourceStrategy: StoryObj = {
	name: "3 — Source & coverage strategy",
	render: () => <OpportunitiesSourceStrategy sources={SOURCE_TARGETS} prompts={withCoverage} />,
};
