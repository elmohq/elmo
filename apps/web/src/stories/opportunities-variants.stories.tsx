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
