/**
 * Stories for the Opportunities page (/app/$brand/opportunities). Renders the
 * real page with mocked brand + opportunities data. The page reads filters from
 * the URL via nuqs, so it's wrapped in NuqsTestingAdapter.
 */
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { OpportunitiesPage } from "@/routes/_authed/app/$brand/opportunities";
import { setMockBrand } from "./_mocks/use-brands";
import { setMockOpportunities } from "./_mocks/server-analysis";
import { mockOpportunities } from "./analytics-fixtures";

const onboardedBrand = {
	id: "brand-1",
	name: "Acme",
	website: "https://acme.com",
	onboarded: true,
	enabled: true,
	prompts: [{ id: "p1", value: "best crm", enabled: true }],
	effectiveModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
	earliestDataDate: "2026-05-05",
	delayOverrideHours: 24,
};

function Shell({ children }: { children: ReactNode }) {
	return (
		<NuqsTestingAdapter>
			<TooltipProvider>
				<div className="bg-background text-foreground antialiased flex min-h-svh flex-col">
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
						</div>
					</div>
				</div>
			</TooltipProvider>
		</NuqsTestingAdapter>
	);
}

const meta = {
	title: "Pages/Opportunities",
	component: OpportunitiesPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			setMockBrand(onboardedBrand);
			setMockOpportunities(mockOpportunities);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof OpportunitiesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
