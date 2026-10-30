import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { Route } from "@/routes/_authed/app/org/$org/brand/$brand/index";

// The route file exports only `Route` (route files must, for code-splitting).
// Render its component via the route options — the mock exposes `options`.
const DashboardPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

import { setMockLandscape, setMockShareOfVoice } from "./_mocks/server-analysis";
import { setMockDashboardSummary } from "./_mocks/server-dashboard";
import { setMockRouteContext } from "./_mocks/tanstack-router";
import { setMockBrand } from "./_mocks/use-brands";
import { mockDashboardSummary, mockLandscape, mockShareOfVoice } from "./analytics-fixtures";

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
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased flex min-h-svh flex-col">
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Pages/Overview",
	component: DashboardPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			setMockBrand(onboardedBrand);
			setMockRouteContext({ clientConfig: { defaultDelayHours: 24 } });
			setMockDashboardSummary(mockDashboardSummary);
			setMockShareOfVoice(mockShareOfVoice);
			setMockLandscape(mockLandscape);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof DashboardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Without the mention judge there is no sentiment or position, so those cards show a dash. */
export const WithoutMentionJudge: Story = {
	decorators: [
		(Story) => {
			const empty = {
				value: null,
				change: null,
				series: mockDashboardSummary.cards.sentiment.series.map((p) => ({ ...p, value: null })),
			};
			setMockDashboardSummary({
				...mockDashboardSummary,
				cards: { ...mockDashboardSummary.cards, sentiment: empty, position: empty },
			});
			return <Story />;
		},
	],
};

/** A long field of competitors scrolls within the landscape rather than stretching the page. */
export const ManyCompetitors: Story = {
	decorators: [
		(Story) => {
			const [brand, ...competitors] = mockDashboardSummary.landscape.companies;
			const filler = Array.from({ length: 60 }, (_, i) => {
				const template = competitors[i % competitors.length];
				return { ...template, name: `${template.name} ${Math.floor(i / competitors.length) + 2}` };
			});
			setMockDashboardSummary({
				...mockDashboardSummary,
				landscape: { ...mockDashboardSummary.landscape, companies: [brand, ...competitors, ...filler] },
			});
			return <Story />;
		},
	],
};
