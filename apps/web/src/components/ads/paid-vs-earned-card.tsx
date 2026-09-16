import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo } from "react";
import { AD_ATTRIBUTION_META, InfoTitle } from "@/components/ads/shared";
import type { AdAdvertiser, AdsData } from "@/components/ads/types";
import { SiteIcon } from "@/components/site-icon";

const ROWS = 6;

function Row({ advertiser, metric }: { advertiser: AdAdvertiser; metric: "paid" | "cited" }) {
	const meta = AD_ATTRIBUTION_META[advertiser.attribution];
	return (
		<div className="flex items-center justify-between gap-2 py-1.5 text-xs">
			<span className="flex min-w-0 items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger render={<span className={cn("size-2 shrink-0 rounded-full", meta.dotClass)} />} />
					<TooltipContent className="text-xs font-normal">{meta.label}</TooltipContent>
				</Tooltip>
				<SiteIcon domain={advertiser.domain} size="xs" />
				<span className="truncate font-medium">{advertiser.competitorName ?? advertiser.name}</span>
			</span>
			<span className="shrink-0 tabular-nums text-muted-foreground">
				{metric === "paid"
					? `${advertiser.impressions} ads · ${advertiser.citedCount} citations`
					: `${advertiser.citedCount} citations · ${advertiser.impressions} ads`}
			</span>
		</div>
	);
}

/**
 * Separates "the model chose them" from "they paid to sit next to the answer".
 * Both sides key on domain, so this is a join between `ad_impressions` and
 * `citations` over the same window and needs no extra collection.
 */
export function PaidVsEarnedCard({ data }: { data: AdsData }) {
	const buyingNotCited = useMemo(
		() =>
			data.advertisers
				.filter((advertiser) => advertiser.citedCount === 0 && advertiser.impressions > 0)
				.sort((a, b) => b.impressions - a.impressions)
				.slice(0, ROWS),
		[data.advertisers],
	);

	const citedAndBuying = useMemo(
		() =>
			data.advertisers
				.filter((advertiser) => advertiser.citedCount > 0 && advertiser.impressions > 0)
				.sort((a, b) => b.citedCount - a.citedCount)
				.slice(0, ROWS),
		[data.advertisers],
	);

	return (
		<Card className="gap-4">
			<CardHeader className="space-y-1">
				<CardTitle>
					<InfoTitle tooltip="Cross-references advertisers against the domains cited organically on the same prompts in the same window. Buying without being cited is a different competitive posture from doing both.">
						Paid vs. Earned
					</InfoTitle>
				</CardTitle>
				<CardDescription>Which advertisers the models also cite on their own</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div className="space-y-2">
					<h4 className="text-sm font-medium">Buying, never cited</h4>
					{buyingNotCited.length === 0 ? (
						<p className="py-3 text-xs text-muted-foreground">Every advertiser here is also cited organically.</p>
					) : (
						<div className="divide-y divide-border/50">
							{buyingNotCited.map((advertiser) => (
								<Row key={advertiser.key} advertiser={advertiser} metric="paid" />
							))}
						</div>
					)}
				</div>
				<div className="space-y-2">
					<h4 className="text-sm font-medium">Cited and buying</h4>
					{citedAndBuying.length === 0 ? (
						<p className="py-3 text-xs text-muted-foreground">No advertiser is also cited on these prompts.</p>
					) : (
						<div className="divide-y divide-border/50">
							{citedAndBuying.map((advertiser) => (
								<Row key={advertiser.key} advertiser={advertiser} metric="cited" />
							))}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
