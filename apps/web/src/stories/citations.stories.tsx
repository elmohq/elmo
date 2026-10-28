import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { Route } from "@/routes/_authed/app/org/$org/brand/$brand/citations";
import {
	setMockCitationDomains,
	setMockCitationFlowRows,
	setMockCitations,
	setMockCitationUrls,
} from "./_mocks/server-citations";
import { setMockBrand } from "./_mocks/use-brands";
import { ALL_FLOW_ROWS, MODELS, mockCitationData } from "./citation-fixtures";

// The route file exports only `Route`; render its component via the route options.
const CitationsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

const brand = {
	id: "mock-brand-id",
	name: "Acme",
	website: "https://acme.com",
	additionalDomains: [],
	onboarded: true,
	enabled: true,
	prompts: [{ id: "p1", value: "best crm", enabled: true }],
	earliestDataDate: "2026-05-05",
	trackedTargets: MODELS.map((model) => ({
		value: model,
		model,
		premium: false,
		tier: "scraped",
		intervalHours: 24,
		replication: 1,
	})),
};

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased flex min-h-svh flex-col">
				<div className="@container/main flex flex-1 flex-col gap-2">
					<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Pages/Citations",
	component: CitationsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			setMockBrand(brand);
			const { domainDistribution = [], specificUrls = [], ...summary } = mockCitationData;
			setMockCitations({ ...summary, availableTags: ["branded", "unbranded"], days: 30 });
			setMockCitationDomains(domainDistribution);
			setMockCitationUrls(specificUrls);
			setMockCitationFlowRows(ALL_FLOW_ROWS);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof CitationsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
