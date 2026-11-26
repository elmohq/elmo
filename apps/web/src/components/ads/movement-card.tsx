import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { AD_ATTRIBUTION_META, InfoTitle } from "@/components/ads/shared";
import type { AdMovementEntry, AdsData } from "@/components/ads/types";
import { SiteIcon } from "@/components/site-icon";

function MovementList({
	title,
	icon,
	entries,
	emptyLabel,
	countFor,
}: {
	title: string;
	icon: React.ReactNode;
	entries: AdMovementEntry[];
	emptyLabel: string;
	countFor: (entry: AdMovementEntry) => number;
}) {
	return (
		<div className="space-y-2">
			<h4 className="flex items-center gap-1.5 text-sm font-medium">
				{icon}
				{title}
			</h4>
			{entries.length === 0 ? (
				<p className="py-3 text-xs text-muted-foreground">{emptyLabel}</p>
			) : (
				<div className="divide-y divide-border/50">
					{entries.map((entry) => {
						const meta = AD_ATTRIBUTION_META[entry.attribution];
						return (
							<div key={entry.key} className="flex items-center justify-between gap-2 py-1.5 text-xs">
								<span className="flex min-w-0 items-center gap-1.5">
									<Tooltip>
										<TooltipTrigger render={<span className={cn("size-2 shrink-0 rounded-full", meta.dotClass)} />} />
										<TooltipContent className="text-xs font-normal">{meta.label}</TooltipContent>
									</Tooltip>
									<SiteIcon domain={entry.domain} size="xs" />
									<span className="truncate font-medium">{entry.competitorName ?? entry.name}</span>
									{entry.domain && entry.domain !== entry.name && (
										<span className="min-w-0 shrink truncate text-muted-foreground">{entry.domain}</span>
									)}
								</span>
								<span className="shrink-0 tabular-nums text-muted-foreground">
									{countFor(entry).toLocaleString()} ads
								</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

/**
 * Who started and who stopped, against the immediately preceding window of the
 * same length. New entrants are the signal worth alerting on — a competitor
 * turning on paid against your prompt set is a decision someone made this week.
 */
export function AdMovementCard({ data }: { data: AdsData }) {
	return (
		<Card className="gap-4">
			<CardHeader className="space-y-1">
				<CardTitle>
					<InfoTitle tooltip="Compared against the previous period of the same length. Ads rotate heavily, so a single-impression advertiser dropping out is noise — these lists are limited to advertisers with a real presence on one side.">
						Who Moved
					</InfoTitle>
				</CardTitle>
				<CardDescription>Advertisers that started or stopped buying against your prompts</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
				<MovementList
					title="Started buying"
					icon={<IconArrowUpRight className="size-4 text-emerald-600" />}
					entries={data.movement.entered}
					emptyLabel="No new advertisers this period."
					countFor={(entry) => entry.impressions}
				/>
				<MovementList
					title="Stopped buying"
					icon={<IconArrowDownRight className="size-4 text-muted-foreground" />}
					entries={data.movement.left}
					emptyLabel="No advertisers dropped out this period."
					countFor={(entry) => entry.previousImpressions}
				/>
			</CardContent>
		</Card>
	);
}
