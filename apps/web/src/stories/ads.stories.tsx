import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ReactNode } from "react";
import { type AdsDisplayProps, AdsVariantA, AdsVariantB, AdsVariantC } from "@/components/ads/variants";
import { PageHeader } from "@/components/page-header";
import { setMockBrand } from "./_mocks/use-brands";
import { mockAdsData } from "./ads-fixtures";

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
			Ads are the sponsored placements answer engines show alongside a response. They are recorded from the same scraped
			answer as citations, so an ad and the answer it ran next to always come from one observation.
		</p>
		<p>
			<strong>Tracked competitor</strong> advertisers are only those whose domain you have added to your competitor
			list. Everything else appears as an unclassified advertiser until you track it.
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

function AdsPage({ variant }: { variant: "a" | "b" | "c" }) {
	const props: AdsDisplayProps = { data: mockAdsData, brandId: "mock-brand-id", brandName: "Elmo" };
	const Variant = variant === "a" ? AdsVariantA : variant === "b" ? AdsVariantB : AdsVariantC;
	return (
		<PageHeader title="Ads" subtitle="See who is buying ads against the prompts you track." infoContent={INFO}>
			<Variant {...props} />
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

/** Variant A — Citations-shaped: numbers, trend, ranked advertisers, then detail. */
export const VariantAAdIntelligence: Story = { args: { variant: "a" } };

/** Variant B — prompt-first: the auction board leads. */
export const VariantBAuctionBoard: Story = { args: { variant: "b" } };

/** Variant C — creative-first: the ads themselves are the page. */
export const VariantCAdLibrary: Story = { args: { variant: "c" } };
