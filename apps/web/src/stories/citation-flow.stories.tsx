import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { type ReactNode, useMemo, useState } from "react";
import { CitationFlowCard } from "@/components/citations/citation-flow-card";
import { type CitationFlowRow, flowDomainOptions } from "@/lib/citation-flow";
import { flowRowsFor, MODELS, mockCitationData } from "./citation-fixtures";

const domains = flowDomainOptions(mockCitationData.domainDistribution ?? [], [
	{ domain: "acme.com", category: "brand" },
]);

/** The card as the page drives it: picking a domain swaps in that domain's rows. */
function FlowCardHarness({
	initialDomain,
	rows,
	isLoading,
	modelOrder = MODELS,
}: {
	initialDomain: string;
	rows?: (domain: string) => CitationFlowRow[] | undefined;
	isLoading?: boolean;
	modelOrder?: string[];
}) {
	const [domain, setDomain] = useState(initialDomain);
	const [search, setSearch] = useState("");
	const domainRows = useMemo(() => (rows ? rows(domain) : flowRowsFor(domain)), [rows, domain]);
	return (
		<CitationFlowCard
			domains={domains.filter((option) => option.domain.includes(search.toLowerCase()))}
			domain={domain}
			onDomainChange={setDomain}
			search={search}
			onSearchChange={setSearch}
			rows={domainRows}
			isLoading={isLoading}
			modelOrder={modelOrder}
		/>
	);
}

function Shell({ children, width }: { children: ReactNode; width?: number }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">
				<div className="mx-auto flex flex-col gap-4" style={{ maxWidth: width ?? 1152 }}>
					{children}
				</div>
			</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Citations/Citation Flow",
	component: FlowCardHarness,
	parameters: { layout: "fullscreen" },
	args: { initialDomain: "acme.com" },
	decorators: [
		(Story, context) => (
			<Shell width={context.parameters.width as number | undefined}>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof FlowCardHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The brand's own site: marketing pages, a blog, comparisons, docs and help-centre subdomains. */
export const BrandSite: Story = {};

/** A competitor's site, to see which of its pages engines lean on. */
export const Competitor: Story = { args: { initialDomain: "hubspot.com" } };

/** A third-party review site: which of its category and review pages carry the answers. */
export const ReviewSite: Story = { args: { initialDomain: "g2.com" } };

/** One cited page: no section column, every engine straight into it. */
export const SinglePage: Story = { args: { initialDomain: "pipedrive.com" } };

/** The page's filters can leave a domain with nothing cited. */
export const NoCitations: Story = { args: { rows: () => [] } };

export const Loading: Story = { args: { rows: () => undefined } };

/** Under the chart's minimum width the same pages read as a ranked list split by engine. */
export const Narrow: Story = { parameters: { width: 420 } };

/** Clicking an engine isolates its flows down to the pages it cites. */
export const HighlightEngine: Story = {
	play: async ({ canvasElement }) => {
		canvasElement
			.querySelector<SVGElement>('[aria-label="Highlight Perplexity"]')
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	},
};
