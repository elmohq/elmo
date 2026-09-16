import { IconExternalLink, IconSearch } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo, useState } from "react";
import { AD_ATTRIBUTION_META, AttributionLegend, formatRange, InfoTitle } from "@/components/ads/shared";
import type { AdAttribution, AdCreative, AdsData } from "@/components/ads/types";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { UnderlineTabs } from "@/components/citations/shared";
import { ListPagination, usePagedList } from "@/components/list-pagination";
import { SiteIcon } from "@/components/site-icon";

type FilterKey = "all" | AdAttribution;

function CreativeCard({ creative }: { creative: AdCreative }) {
	const meta = AD_ATTRIBUTION_META[creative.attribution];
	const [first, ...rest] = creative.prompts;

	return (
		<div className="flex h-full flex-col gap-3 rounded-lg border border-border/60 bg-card p-3">
			<div className="flex items-start justify-between gap-2">
				<span className="flex min-w-0 items-center gap-1.5">
					<Tooltip>
						<TooltipTrigger render={<span className={cn("size-2 shrink-0 rounded-full", meta.dotClass)} />} />
						<TooltipContent className="text-xs font-normal">{meta.label}</TooltipContent>
					</Tooltip>
					<SiteIcon domain={creative.advertiserDomain} size="xs" />
					<span className="truncate text-xs font-medium">{creative.competitorName ?? creative.advertiserName}</span>
				</span>
				<span className="shrink-0 text-xs font-semibold tabular-nums">{creative.impressions.toLocaleString()}</span>
			</div>

			{/* The ad as the user saw it. */}
			<div className="space-y-1 rounded-md bg-muted/40 p-2.5">
				<p className="text-sm font-semibold leading-snug">{creative.headline}</p>
				<p className="text-xs leading-relaxed text-muted-foreground">{creative.body}</p>
			</div>

			<div className="space-y-1">
				{first && (
					<BrandPromptLink promptId={first.id} className="group flex items-center justify-between gap-2 text-[11px]">
						<span className="min-w-0 truncate text-muted-foreground group-hover:text-foreground group-hover:underline">
							{first.value}
						</span>
						<span className="shrink-0 tabular-nums text-muted-foreground">{first.count}</span>
					</BrandPromptLink>
				)}
				{rest.length > 0 && (
					<Tooltip>
						<TooltipTrigger
							render={
								<span className="cursor-help text-[11px] text-muted-foreground underline decoration-dotted">
									+{rest.length} more prompt{rest.length === 1 ? "" : "s"}
								</span>
							}
						/>
						<TooltipContent className="max-w-xs text-xs font-normal">
							<ul className="space-y-0.5">
								{rest.slice(0, 8).map((prompt) => (
									<li key={prompt.id}>{prompt.value}</li>
								))}
							</ul>
						</TooltipContent>
					</Tooltip>
				)}
			</div>

			<div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
				<span>{formatRange(creative.firstSeen, creative.lastSeen)}</span>
				{creative.targetUrl && (
					<a
						href={creative.targetUrl}
						target="_blank"
						rel="noreferrer nofollow"
						className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
					>
						{creative.advertiserDomain}
						<IconExternalLink className="size-3" />
					</a>
				)}
			</div>
		</div>
	);
}

/**
 * The literal ad copy competitors are running against your prompts. The most
 * directly actionable artifact on the page — it's the positioning they paid to
 * put next to an answer about you.
 */
export function CreativeGallery({ data, pageSize = 9 }: { data: AdsData; pageSize?: number }) {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<FilterKey>("all");

	const counts = useMemo(() => {
		const byAttribution: Record<AdAttribution, number> = { brand: 0, competitor: 0, other: 0 };
		for (const creative of data.creatives) byAttribution[creative.attribution] += 1;
		return byAttribution;
	}, [data.creatives]);

	const tabs = useMemo(() => {
		const entries: { key: FilterKey; label: string }[] = [{ key: "all", label: `All (${data.creatives.length})` }];
		for (const key of ["competitor", "brand", "other"] as const) {
			if (counts[key] > 0) entries.push({ key, label: `${AD_ATTRIBUTION_META[key].label} (${counts[key]})` });
		}
		return entries;
	}, [counts, data.creatives.length]);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return data.creatives.filter((creative) => {
			if (filter !== "all" && creative.attribution !== filter) return false;
			if (!query) return true;
			return (
				creative.headline.toLowerCase().includes(query) ||
				creative.body.toLowerCase().includes(query) ||
				creative.advertiserName.toLowerCase().includes(query) ||
				creative.advertiserDomain.toLowerCase().includes(query)
			);
		});
	}, [data.creatives, filter, search]);

	const { page, setPage, pageItems, totalItems } = usePagedList(filtered, pageSize);

	return (
		<Card className="gap-4">
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0 space-y-1">
						<CardTitle>
							<InfoTitle tooltip="Every distinct ad creative seen on your prompts, with the copy exactly as it ran. One advertiser often rotates several headlines against the same query.">
								Ad Creatives
							</InfoTitle>
						</CardTitle>
						<CardDescription>The copy competitors are running against your prompts</CardDescription>
					</div>
					<InputGroup className="h-8 shrink-0 sm:w-56">
						<InputGroupInput
							placeholder="Search headlines, copy..."
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
					<div className="mb-4">
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
					<p className="py-8 text-center text-sm text-muted-foreground">No creatives match these filters.</p>
				) : (
					<>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
							{pageItems.map((creative) => (
								<CreativeCard key={creative.id} creative={creative} />
							))}
						</div>
						<ListPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} />
						<div className="mt-3">
							<AttributionLegend />
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
