import { IconInfoCircle, IconSearch } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { UnderlineTabs } from "@/components/citations/shared";
import { TrackDomainPopover } from "@/components/citations/track-domain-popover";
import type { CitationData, CitationDomainItem, CitationListControls } from "@/components/citations/types";
import { ListPagination } from "@/components/list-pagination";
import { DOMAIN_CATEGORY_COLORS, ProgressBarChart } from "@/components/progress-bar-chart";
import { SiteIcon } from "@/components/site-icon";

export function TopDomainsCard({
	list,
	sourceTabs,
	maxDomains,
	brandId,
	brandName,
	competitors,
	onCompetitorAdded,
	onDomainSelect,
}: {
	list: CitationListControls<CitationDomainItem>;
	sourceTabs: { key: string; label: string }[];
	maxDomains: number;
	brandId?: string;
	brandName?: string;
	competitors?: CitationData["competitors"];
	onCompetitorAdded?: () => void;
	onDomainSelect?: (domain: string) => void;
}) {
	return (
		<Card className="gap-4">
			<CardHeader>
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					<div className="space-y-1 min-w-0">
						<CardTitle className="flex items-center gap-1.5">
							Top Cited Domains
							<Tooltip>
								<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-sm font-normal">
									The most frequently cited domains across all prompt evaluations. Each domain is colored by its
									category (brand, competitor, etc.).
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>Which domains LLMs reference most when responding to your prompts</CardDescription>
					</div>
					<InputGroup className="h-8 shrink-0 sm:w-48">
						<InputGroupInput
							placeholder="Search domains..."
							value={list.search}
							onChange={(e) => list.setSearch(e.target.value)}
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
				{sourceTabs.length > 2 && (
					<div className="mb-3">
						<UnderlineTabs tabs={sourceTabs} activeKey={list.category} onSelect={list.setCategory} />
					</div>
				)}
				{/* The card itself is gated on the UNFILTERED list by the parent;
				    only the rows react to the search/tab filters, so a no-match
				    search shows this message instead of hiding the section (#322). */}
				{list.totalItems > 0 ? (
					<div className={`transition-opacity ${list.isFetching ? "opacity-60" : ""}`}>
						<ProgressBarChart
							items={list.items.map((domain) => ({
								label: domain.domain,
								count: domain.count,
								icon: <SiteIcon domain={domain.domain} size="md" />,
								category: domain.category || "other",
								onClick: onDomainSelect ? () => onDomainSelect(domain.domain) : undefined,
								tooltip: onDomainSelect ? "See which of its pages engines cite, in Citation Flow" : undefined,
								action:
									domain.category === "other" && brandId && competitors ? (
										<TrackDomainPopover
											domain={domain.domain}
											brandId={brandId}
											brandName={brandName}
											competitors={competitors}
											onAdded={onCompetitorAdded}
										/>
									) : undefined,
							}))}
							colorMapping={DOMAIN_CATEGORY_COLORS}
							percentageMode="max"
						/>
						<ListPagination
							page={list.page}
							pageSize={maxDomains}
							totalItems={list.totalItems}
							onPageChange={list.setPage}
						/>
					</div>
				) : (
					!list.isFetching && (
						<p className="text-sm text-muted-foreground text-center py-4">No domains match the current filters.</p>
					)
				)}
			</CardContent>
		</Card>
	);
}
