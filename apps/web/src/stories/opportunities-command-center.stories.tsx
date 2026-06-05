/**
 * AEO command center concept — opportunities grouped by the move that wins each
 * prompt (Creation / Refresh / Outreach / Community), benchmarked against the
 * best competitor, with citation volatility folded in as a "field" tag.
 * Storybook-only; the per-prompt classification is mocked for the concept.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { OpportunitiesPlaybook, type PlaybookPrompt, type Field, type OppType } from "@/components/opportunities-playbook";
import { mockOpportunities } from "./analytics-fixtures";

// Action classification per prompt (incl. the former "Few Brand Mentions" p9/p10,
// reframed as Untapped / Community). type drives the category + action.
const PLAYBOOK: Record<string, { type: OppType; leader: { name: string; rate: number }; target: string; field?: Field; trendPp?: number }> = {
	p1: { type: "popular-gap", leader: { name: "Globex", rate: 0.68 }, target: "a definitive “best CRM” guide", field: "contested" },
	p3: { type: "content-gap", leader: { name: "Globex", rate: 0.52 }, target: "globex.com/accounting-guide", field: "locked" },
	p9: { type: "untapped", leader: { name: "Initech", rate: 0.06 }, target: "a definitive CRM explainer", field: "open" },
	p5: { type: "almost", leader: { name: "Initech", rate: 0.47 }, target: "acme.com/remote-collaboration", field: "contested" },
	p4: { type: "declining", leader: { name: "Globex", rate: 0.5 }, target: "acme.com/help-desk-guide", trendPp: -8 },
	p2: { type: "weak-content", leader: { name: "Initech", rate: 0.64 }, target: "acme.com/project-management-tools" },
	p6: { type: "mention-gap", leader: { name: "Umbrella", rate: 0.31 }, target: "g2.com", field: "open" },
	p10: { type: "community", leader: { name: "Initech", rate: 0.05 }, target: "the cited Reddit threads", field: "open" },
};
const prompts: PlaybookPrompt[] = mockOpportunities.prompts
	.filter((p) => PLAYBOOK[p.promptId])
	.map((p) => ({ ...p, ...PLAYBOOK[p.promptId] }));

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			{/* Fixed width so the Storybook canvas renders the desktop layout; the
			    real route uses its own container. */}
			<div className="bg-background text-foreground antialiased min-h-svh w-[1120px] p-4 md:p-6">{children}</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Concepts/AEO command center",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const CommandCenter: StoryObj = {
	name: "Command center",
	render: () => (
		<Shell>
			<OpportunitiesPlaybook prompts={prompts} />
		</Shell>
	),
};
