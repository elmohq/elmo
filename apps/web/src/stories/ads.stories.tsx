import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ReactNode } from "react";
import { AdsDisplay } from "@/components/ads/ads-display";
import type { AdsData } from "@/components/ads/types";
import { PageHeader } from "@/components/page-header";
import { setMockBrand } from "./_mocks/use-brands";
import { mockAdsData, mockAdsNoAdCapablePlatforms, mockAdsNoneEverSeen, mockAdsSurfaceGoneQuiet } from "./ads-fixtures";

const onboardedBrand = {
	id: "mock-brand-id",
	name: "Elmo",
	website: "https://elmohq.com",
	onboarded: true,
	enabled: true,
	prompts: mockAdsData.prompts.map((prompt) => ({ id: prompt.id, value: prompt.value, enabled: true })),
	effectiveModels: ["chatgpt", "google-ai-mode"],
	earliestDataDate: "2026-05-11",
	delayOverrideHours: 24,
};

const INFO = (
	<>
		<p className="mb-2">
			Ads are the paid placements an answer engine shows alongside a response. They come from the same scraped answer as
			citations, so an ad and the answer it ran next to are always one observation.
		</p>
		<p>
			<strong>Tracked competitor</strong> advertisers are only those whose domain is on your competitor list. Everything
			else stays unclassified until you track it.
		</p>
	</>
);

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="flex min-h-svh flex-col bg-background text-foreground antialiased">
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

function AdsPage({ data }: { data: AdsData }) {
	return (
		<PageHeader title="Ads" subtitle="See who is buying ads against the prompts you track." infoContent={INFO}>
			<AdsDisplay data={data} brandId="mock-brand-id" brandName="Elmo" />
		</PageHeader>
	);
}

const meta = {
	title: "Pages/Ads",
	component: AdsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			setMockBrand(onboardedBrand);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof AdsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: mockAdsData } };

/** Both platforms answering, nobody has ever bought against these prompts. */
export const NoAdsEverSeen: Story = { args: { data: mockAdsNoneEverSeen } };

/** Ads used to appear and have stopped — the case that must not read as "nobody is buying". */
export const PlatformGoneQuiet: Story = { args: { data: mockAdsSurfaceGoneQuiet } };

/** The brand tracks nothing that can carry an ad. */
export const NoAdCapablePlatforms: Story = { args: { data: mockAdsNoAdCapablePlatforms } };
