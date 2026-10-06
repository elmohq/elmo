import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { ReactNode } from "react";
import { InfoTitle } from "@/components/ads/shared";
import type { AdsData } from "@/components/ads/types";

function StatCard({
	title,
	tooltip,
	value,
	footnote,
}: {
	title: string;
	tooltip: ReactNode;
	value: ReactNode;
	footnote?: ReactNode;
}) {
	return (
		<Card className="flex flex-col gap-2">
			<CardHeader className="gap-0">
				<CardTitle className="text-sm font-medium text-muted-foreground">
					<InfoTitle tooltip={tooltip}>{title}</InfoTitle>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col justify-center gap-1">
				<div className="text-2xl font-bold sm:text-3xl lg:text-4xl">{value}</div>
				{footnote && <div className="text-xs text-muted-foreground">{footnote}</div>}
			</CardContent>
		</Card>
	);
}

/**
 * Four numbers, no charts: each is a single current value, which is a stat
 * tile's job rather than a one-bar chart's.
 */
export function AdsStatsCards({ data }: { data: AdsData }) {
	const competitorImpressions = Math.round((data.competitorSharePercent / 100) * data.totalImpressions);
	const promptsWithAds = data.prompts.filter((prompt) => prompt.impressions > 0).length;

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<StatCard
				title="Ad Rate"
				tooltip="Share of answers to your prompts that carried an ad. Only surfaces that can show ads count toward the denominator — a model reached through its API never shows one."
				value={`${data.adRate}%`}
				footnote={`${data.totalImpressions.toLocaleString()} ads across ${data.eligibleRuns.toLocaleString()} answers`}
			/>
			<StatCard
				title="Competitor Ad Share"
				tooltip="Share of the ads on your prompts bought by a competitor you track. Everything else is an advertiser you haven't added — track one to move it into this number."
				value={`${data.competitorSharePercent}%`}
				footnote={`${competitorImpressions.toLocaleString()} of ${data.totalImpressions.toLocaleString()} ads`}
			/>
			<StatCard
				title="Advertisers"
				tooltip="Distinct advertisers seen buying against your prompt set in this period."
				value={data.uniqueAdvertisers.toLocaleString()}
				footnote={`on ${promptsWithAds.toLocaleString()} of your ${data.prompts.length.toLocaleString()} prompts`}
			/>
			<StatCard
				title="Your Ads"
				tooltip="Ads on your own prompts bought by you. Zero means every ad slot next to these answers went to someone else."
				value={data.brandImpressions.toLocaleString()}
				footnote={data.brandImpressions === 0 ? "every ad slot went to someone else" : "ads bought by your brand"}
			/>
		</div>
	);
}
