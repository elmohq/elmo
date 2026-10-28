import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import { iconIdForModelFilter, labelForModelFilter } from "@workspace/config/model-filter";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo, useState } from "react";
import { AD_ATTRIBUTION_META, AttributionLegend, formatRange, InfoTitle } from "@/components/ads/shared";
import type { AdAdvertiser, AdAttribution, AdsData } from "@/components/ads/types";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { UnderlineTabs } from "@/components/citations/shared";
import { TrackDomainPopover } from "@/components/citations/track-domain-popover";
import { ListPagination, usePagedList } from "@/components/list-pagination";
import { SiteIcon } from "@/components/site-icon";

const PAGE_SIZE = 10;

type FilterKey = "all" | AdAttribution;

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
	if (previous === 0) {
		return (
			<span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">New</span>
		);
	}
	const change = Math.round(((current - previous) / previous) * 100);
	if (change === 0) return <span className="text-[11px] tabular-nums text-muted-foreground">even</span>;
	return (
		<span className={cn("text-[11px] tabular-nums", change > 0 ? "text-emerald-600" : "text-muted-foreground")}>
			{change > 0 ? "+" : ""}
			{change}%
		</span>
	);
}

function AdvertiserPrompts({ advertiser }: { advertiser: AdAdvertiser }) {
	return (
		<div className="space-y-0.5 pb-2 pl-6">
			{advertiser.prompts.map((prompt) => (
				<BrandPromptLink
					key={prompt.id}
					promptId={prompt.id}
					className="group flex items-center justify-between py-1 text-xs"
				>
					<span className="min-w-0 truncate text-muted-foreground group-hover:text-foreground group-hover:underline">
						{prompt.value}
					</span>
					<span className="ml-3 shrink-0 tabular-nums text-muted-foreground">{prompt.count.toLocaleString()}</span>
				</BrandPromptLink>
			))}
		</div>
	);
}

/**
 * Who is buying against your prompts, by impression share.
 *
 * Bars are scaled against the leader, not the total: the tail is long (70-odd
 * advertisers over ~200 impressions in a typical month) and a total-scaled bar
 * renders everything below the top three as a hairline.
 */
export function TopAdvertisersCard({
	data,
	brandId,
	brandName,
	onCompetitorAdded,
}: {
	data: AdsData;
	brandId?: string;
	brandName?: string;
	onCompetitorAdded?: () => void;
}) {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<FilterKey>("all");
	const [expanded, setExpanded] = useState<string | null>(null);

	const counts = useMemo(() => {
		const byAttribution: Record<AdAttribution, number> = { brand: 0, competitor: 0, other: 0 };
		for (const advertiser of data.advertisers) byAttribution[advertiser.attribution] += 1;
		return byAttribution;
	}, [data.advertisers]);

	const tabs = useMemo(() => {
		const entries: { key: FilterKey; label: string }[] = [{ key: "all", label: `All (${data.advertisers.length})` }];
		for (const key of ["competitor", "brand", "other"] as const) {
			if (counts[key] > 0) entries.push({ key, label: `${AD_ATTRIBUTION_META[key].label} (${counts[key]})` });
		}
		return entries;
	}, [counts, data.advertisers.length]);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return data.advertisers.filter((advertiser) => {
			if (filter !== "all" && advertiser.attribution !== filter) return false;
			if (!query) return true;
			return (advertiser.domain ?? "").toLowerCase().includes(query) || advertiser.name.toLowerCase().includes(query);
		});
	}, [data.advertisers, filter, search]);

	const { page, setPage, pageItems, totalItems } = usePagedList(filtered, PAGE_SIZE);
	const leader = filtered[0]?.impressions ?? 1;

	return (
		<Card className="gap-4">
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0 space-y-1">
						<CardTitle>
							<InfoTitle tooltip="Advertisers that bought a slot next to an answer to one of your prompts, ranked by how often they appeared. Ad serving rotates heavily, so read the ranking as share of voice rather than an exact count.">
								Who&apos;s Buying Your Prompts
							</InfoTitle>
						</CardTitle>
						<CardDescription>Advertisers appearing alongside answers to your tracked prompts</CardDescription>
					</div>
					<InputGroup className="h-8 shrink-0 sm:w-48">
						<InputGroupInput
							placeholder="Search advertisers..."
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(0);
							}}
							className="h-8 text-xs"
						/>
						<InputGroupAddon className="pl-2.5">
							<IconSearch className="size-3.5" />
						</InputGroupAddon>
					</InputGroup>
				</div>
			</CardHeader>
			<Separator />
			<CardContent>
				{tabs.length > 2 && (
					<div className="mb-3">
						<UnderlineTabs
							tabs={tabs}
							activeKey={filter}
							onSelect={(key) => {
								setFilter(key);
								setPage(0);
							}}
						/>
					</div>
				)}
				{totalItems === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">No advertisers match these filters.</p>
				) : (
					<>
						<div className="divide-y divide-border/50">
							{pageItems.map((advertiser) => {
								const isExpanded = expanded === advertiser.key;
								const meta = AD_ATTRIBUTION_META[advertiser.attribution];
								return (
									<div key={advertiser.key} className="py-2.5">
										<div className="flex items-center justify-between gap-3">
											<button
												type="button"
												onClick={() => setExpanded(isExpanded ? null : advertiser.key)}
												className="group flex min-w-0 cursor-pointer items-center gap-1.5 text-left"
											>
												<IconChevronDown
													className={cn(
														"size-3.5 shrink-0 text-muted-foreground transition-transform",
														!isExpanded && "-rotate-90",
													)}
												/>
												<Tooltip>
													<TooltipTrigger
														render={<span className={cn("size-2 shrink-0 rounded-full", meta.dotClass)} />}
													/>
													<TooltipContent className="text-xs font-normal">{meta.label}</TooltipContent>
												</Tooltip>
												<SiteIcon domain={advertiser.domain} size="xs" />
												<span className="truncate text-sm font-medium group-hover:underline">
													{advertiser.competitorName ?? advertiser.name}
												</span>
												{advertiser.competitorName && advertiser.competitorName !== advertiser.name && (
													<span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
														({advertiser.name})
													</span>
												)}
											</button>
											<div className="flex shrink-0 items-center gap-2.5">
												<DeltaBadge current={advertiser.impressions} previous={advertiser.previousImpressions} />
												<span className="text-sm font-semibold tabular-nums">
													{advertiser.impressions.toLocaleString()}
												</span>
												<span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
													{advertiser.sharePercent}%
												</span>
											</div>
										</div>
										<div className="mt-1.5 flex items-center gap-3 pl-6">
											<div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-primary/10">
												<div
													className="h-full rounded-full"
													style={{
														width: `${(advertiser.impressions / leader) * 100}%`,
														backgroundColor: meta.color,
													}}
												/>
											</div>
											<span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
												{advertiser.models.map((model) => (
													<Tooltip key={model}>
														<TooltipTrigger
															render={
																<span className="inline-flex">
																	<ModelIcon iconId={iconIdForModelFilter(model)} className="size-3.5" />
																</span>
															}
														/>
														<TooltipContent className="text-xs font-normal">
															{labelForModelFilter(model)}
														</TooltipContent>
													</Tooltip>
												))}
												{advertiser.promptCount} prompt{advertiser.promptCount === 1 ? "" : "s"} ·{" "}
												{formatRange(advertiser.firstSeen, advertiser.lastSeen)}
											</span>
											{advertiser.attribution === "other" && advertiser.domain && brandId && (
												<TrackDomainPopover
													domain={advertiser.domain}
													brandId={brandId}
													brandName={brandName}
													competitors={data.competitors}
													onAdded={onCompetitorAdded}
												/>
											)}
										</div>
										{isExpanded && <AdvertiserPrompts advertiser={advertiser} />}
									</div>
								);
							})}
						</div>
						<ListPagination page={page} pageSize={PAGE_SIZE} totalItems={totalItems} onPageChange={setPage} />
						<div className="mt-3">
							<AttributionLegend />
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
