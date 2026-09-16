import { IconChevronDown } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo, useState } from "react";
import { AD_ATTRIBUTION_META, AttributionLegend, InfoTitle } from "@/components/ads/shared";
import type { AdsData } from "@/components/ads/types";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { ListPagination, usePagedList } from "@/components/list-pagination";
import { SiteIcon } from "@/components/site-icon";

const PAGE_SIZE = 8;

/**
 * Which prompts draw ads, and who buys them.
 *
 * Ranked by ad rate rather than raw impressions so a prompt that runs on fewer
 * surfaces isn't buried under one that simply runs more often.
 */
export function ContestedPromptsCard({ data }: { data: AdsData }) {
	const [expanded, setExpanded] = useState<string | null>(null);

	const contested = useMemo(
		() => data.prompts.filter((prompt) => prompt.impressions > 0).sort((a, b) => b.adRate - a.adRate),
		[data.prompts],
	);
	const { page, setPage, pageItems, totalItems } = usePagedList(contested, PAGE_SIZE);
	const peak = contested[0]?.adRate ?? 1;

	return (
		<Card className="gap-4">
			<CardHeader className="space-y-1">
				<CardTitle>
					<InfoTitle tooltip="Your prompts ordered by how often an answer to them carried an ad. A high rate means the answer alone doesn't own the screen for that query.">
						Contested Prompts
					</InfoTitle>
				</CardTitle>
				<CardDescription>
					{contested.length.toLocaleString()} of your {data.prompts.length.toLocaleString()} prompts drew at least one
					ad
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent>
				{totalItems === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">No ads appeared on your prompts this period.</p>
				) : (
					<>
						<div className="divide-y divide-border/50">
							{pageItems.map((prompt) => {
								const isExpanded = expanded === prompt.id;
								const top = prompt.advertisers.slice(0, 4);
								return (
									<div key={prompt.id} className="py-2.5">
										<div className="flex items-start justify-between gap-3">
											<button
												type="button"
												onClick={() => setExpanded(isExpanded ? null : prompt.id)}
												className="group flex min-w-0 cursor-pointer items-start gap-1.5 text-left"
											>
												<IconChevronDown
													className={cn(
														"mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
														!isExpanded && "-rotate-90",
													)}
												/>
												<span className="min-w-0 text-sm font-medium group-hover:underline">{prompt.value}</span>
											</button>
											<div className="flex shrink-0 items-center gap-2.5">
												<span className="text-sm font-semibold tabular-nums">{prompt.adRate}%</span>
												<span className="w-20 text-right text-[11px] tabular-nums text-muted-foreground">
													{prompt.impressions}/{prompt.eligibleRuns} answers
												</span>
											</div>
										</div>
										<div className="mt-1.5 flex items-center gap-3 pl-5">
											<div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-primary/10">
												<div
													className="h-full rounded-full bg-foreground/60"
													style={{ width: `${(prompt.adRate / peak) * 100}%` }}
												/>
											</div>
											<span className="flex shrink-0 items-center gap-1">
												{top.map((advertiser) => (
													<Tooltip key={advertiser.domain}>
														<TooltipTrigger
															render={
																<span className="inline-flex items-center">
																	<SiteIcon domain={advertiser.domain} size="xs" />
																</span>
															}
														/>
														<TooltipContent className="text-xs font-normal">
															{advertiser.competitorName ?? advertiser.name} · {advertiser.count} ad
															{advertiser.count === 1 ? "" : "s"}
														</TooltipContent>
													</Tooltip>
												))}
												{prompt.advertisers.length > top.length && (
													<span className="text-[11px] text-muted-foreground">
														+{prompt.advertisers.length - top.length}
													</span>
												)}
											</span>
										</div>
										{isExpanded && (
											<div className="space-y-0.5 py-2 pl-5">
												{prompt.advertisers.map((advertiser) => {
													const meta = AD_ATTRIBUTION_META[advertiser.attribution];
													return (
														<div
															key={advertiser.domain}
															className="flex items-center justify-between gap-2 py-1 text-xs"
														>
															<span className="flex min-w-0 items-center gap-1.5">
																<span className={cn("size-2 shrink-0 rounded-full", meta.dotClass)} />
																<SiteIcon domain={advertiser.domain} size="xs" />
																<span className="truncate text-muted-foreground">
																	{advertiser.competitorName ?? advertiser.name}
																</span>
															</span>
															<span className="shrink-0 tabular-nums text-muted-foreground">{advertiser.count}</span>
														</div>
													);
												})}
												<BrandPromptLink
													promptId={prompt.id}
													className="mt-1 inline-block text-xs text-muted-foreground underline hover:text-foreground"
												>
													Open prompt
												</BrandPromptLink>
											</div>
										)}
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
