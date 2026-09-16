import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo, useState } from "react";
import { AD_ATTRIBUTION_META, InfoTitle } from "@/components/ads/shared";
import type { AdsData } from "@/components/ads/types";
import { ListPagination, usePagedList } from "@/components/list-pagination";
import { SiteIcon } from "@/components/site-icon";

const ADVERTISER_ROWS = 12;
const PROMPT_COLUMNS = 14;

/**
 * Cell shading is sequential — one hue, light to dark, because the cell encodes
 * magnitude and nothing else. Attribution is carried by the row label's dot, so
 * colour never does two jobs at once.
 */
// Spelled out because Tailwind only sees literal class names.
const RAMP_CLASSES = ["bg-muted/30", "bg-foreground/10", "bg-foreground/25", "bg-foreground/45", "bg-foreground/70"];
const RAMP_STEPS = RAMP_CLASSES.length;

const rampClass = (step: number) => RAMP_CLASSES[step];

/**
 * Prompt × advertiser grid. Answers "which of my queries are contested, and by
 * whom" in one read, which the two ranked lists can only answer one axis at a
 * time.
 *
 * Both axes page independently — a brand with 100 prompts and 400 advertisers
 * would otherwise render a grid no one can scan.
 */
export function AuctionMatrix({ data }: { data: AdsData }) {
	const [promptPage, setPromptPage] = useState(0);

	// Competitors first, then by volume: the rows a user came here for sit at the top.
	const advertisers = useMemo(
		() =>
			[...data.advertisers].sort((a, b) => {
				const rank = (attribution: string) => (attribution === "competitor" ? 0 : attribution === "brand" ? 1 : 2);
				return rank(a.attribution) - rank(b.attribution) || b.impressions - a.impressions;
			}),
		[data.advertisers],
	);

	const { page, setPage, pageItems: advertiserRows, totalItems } = usePagedList(advertisers, ADVERTISER_ROWS);

	const prompts = useMemo(
		() => data.prompts.filter((prompt) => prompt.impressions > 0).sort((a, b) => b.impressions - a.impressions),
		[data.prompts],
	);
	const promptPages = Math.max(1, Math.ceil(prompts.length / PROMPT_COLUMNS));
	const visiblePrompts = prompts.slice(promptPage * PROMPT_COLUMNS, (promptPage + 1) * PROMPT_COLUMNS);

	const cells = useMemo(() => {
		const byKey = new Map<string, number>();
		for (const prompt of data.prompts) {
			for (const advertiser of prompt.advertisers) {
				byKey.set(`${advertiser.domain}|${prompt.id}`, advertiser.count);
			}
		}
		return byKey;
	}, [data.prompts]);

	const peak = useMemo(() => Math.max(1, ...[...cells.values()]), [cells]);
	const stepFor = (count: number) =>
		count === 0 ? 0 : Math.min(RAMP_STEPS - 1, Math.max(1, Math.ceil((count / peak) * (RAMP_STEPS - 1))));

	return (
		<Card className="gap-4">
			<CardHeader className="space-y-1">
				<CardTitle>
					<InfoTitle tooltip="Each cell is how many times that advertiser appeared on that prompt. Darker is more. Competitors are pinned to the top rows; prompts run left to right by total ad volume.">
						Auction Board
					</InfoTitle>
				</CardTitle>
				<CardDescription>Which advertiser is contesting which prompt</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="space-y-3">
				<div className="overflow-x-auto">
					{/* Not `w-full`: a stretched table hands all the slack to the label column and opens a gutter before the first cell. */}
					<table className="border-separate border-spacing-[2px] text-xs">
						<caption className="sr-only">
							Ad impressions by advertiser and prompt. Rows are advertisers, columns are prompts.
						</caption>
						<thead>
							<tr>
								<th scope="col" className="w-56 min-w-56 text-left align-bottom font-medium text-muted-foreground">
									Advertiser
								</th>
								{visiblePrompts.map((prompt) => (
									<th key={prompt.id} scope="col" className="w-7 min-w-7 p-0 align-bottom">
										<Tooltip>
											<TooltipTrigger
												render={
													<div className="flex h-44 w-7 cursor-help items-end justify-center pb-1">
														{/* Vertical writing mode rather than a rotate transform: the box
														    still participates in layout, so the header can't overlap the
														    grid or its neighbours. */}
														<span className="max-h-44 truncate text-[11px] leading-none text-muted-foreground [writing-mode:vertical-rl] rotate-180">
															{prompt.value}
														</span>
													</div>
												}
											/>
											<TooltipContent className="max-w-xs text-xs font-normal">
												{prompt.value} · {prompt.impressions} ad{prompt.impressions === 1 ? "" : "s"} ({prompt.adRate}%
												of answers)
											</TooltipContent>
										</Tooltip>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{advertiserRows.map((advertiser) => {
								const meta = AD_ATTRIBUTION_META[advertiser.attribution];
								return (
									<tr key={advertiser.domain}>
										<th scope="row" className="w-56 min-w-56 py-0.5 pr-2 text-left font-normal">
											<span className="flex min-w-0 items-center gap-1.5">
												<Tooltip>
													<TooltipTrigger
														render={<span className={cn("size-2 shrink-0 rounded-full", meta.dotClass)} />}
													/>
													<TooltipContent className="text-xs font-normal">{meta.label}</TooltipContent>
												</Tooltip>
												<SiteIcon domain={advertiser.domain} size="xs" />
												<span className="truncate">{advertiser.competitorName ?? advertiser.name}</span>
												<span className="ml-auto shrink-0 pl-2 tabular-nums text-muted-foreground">
													{advertiser.impressions}
												</span>
											</span>
										</th>
										{visiblePrompts.map((prompt) => {
											const count = cells.get(`${advertiser.domain}|${prompt.id}`) ?? 0;
											return (
												<td key={prompt.id} className="p-0">
													<Tooltip>
														<TooltipTrigger
															render={
																<div
																	className={cn(
																		"size-7 rounded-[4px] ring-1 ring-inset ring-background",
																		rampClass(stepFor(count)),
																		count > 0 && "cursor-help",
																	)}
																/>
															}
														/>
														<TooltipContent className="max-w-xs text-xs font-normal">
															<span className="font-medium">{advertiser.competitorName ?? advertiser.name}</span>
															<br />
															{prompt.value}
															<br />
															{count === 0 ? "No ads" : `${count} ad${count === 1 ? "" : "s"}`}
														</TooltipContent>
													</Tooltip>
												</td>
											);
										})}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
						<span>Fewer ads</span>
						{RAMP_CLASSES.map((rampClass) => (
							<span key={rampClass} className={cn("size-3 rounded-[3px]", rampClass)} />
						))}
						<span>More · up to {peak}</span>
					</div>
					{promptPages > 1 && (
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
							<button
								type="button"
								onClick={() => setPromptPage(Math.max(0, promptPage - 1))}
								disabled={promptPage === 0}
								className="cursor-pointer rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
							>
								Earlier prompts
							</button>
							<span className="tabular-nums">
								{promptPage + 1} / {promptPages}
							</span>
							<button
								type="button"
								onClick={() => setPromptPage(Math.min(promptPages - 1, promptPage + 1))}
								disabled={promptPage >= promptPages - 1}
								className="cursor-pointer rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
							>
								More prompts
							</button>
						</div>
					)}
				</div>

				<ListPagination page={page} pageSize={ADVERTISER_ROWS} totalItems={totalItems} onPageChange={setPage} />
			</CardContent>
		</Card>
	);
}
