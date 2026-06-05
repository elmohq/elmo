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

export const Competitive: StoryObj = {
	name: "2 — Competitive battleground",
	render: () => <OpportunitiesCompetitive prompts={withLead} standings={standings} />,
};

export const SourceStrategy: StoryObj = {
	name: "3 — Source & coverage strategy",
	render: () => <OpportunitiesSourceStrategy sources={SOURCE_TARGETS} prompts={withCoverage} />,
};
