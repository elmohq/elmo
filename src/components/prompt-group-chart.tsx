"use client";

import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { IconExternalLink, IconChevronDown } from "@tabler/icons-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { BaseChart } from "./base-chart";
import { useCompetitors, useBrand } from "@/hooks/use-brands";
import { usePromptRuns } from "@/hooks/use-prompt-runs";
import type { PromptRun } from "@/lib/db/schema";
import {
	LookbackPeriod,
	calculateGroupVisibilityData,
	createPromptToWebQueryMapping,
	generateOptimizationUrl,
} from "@/lib/chart-utils";

interface Prompt {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	enabled: boolean;
	createdAt: Date;
}

interface PromptGroupChartProps {
	lookback: LookbackPeriod;
	groupName: string;
	prompts: Prompt[];
	brandId?: string;
	promptRuns?: PromptRun[];
	webSearchEnabled?: boolean;
}

export function PromptGroupChart({
	lookback = "1m",
	groupName,
	prompts = [],
	brandId,
	promptRuns: propPromptRuns,
	webSearchEnabled,
}: PromptGroupChartProps) {
	const { competitors, isLoading: competitorsLoading } = useCompetitors(brandId);
	const { brand, isLoading: brandLoading } = useBrand(brandId);
	const { promptRuns: hookPromptRuns, isLoading: runsLoading } = usePromptRuns(brandId, { lookback });

	// Use prop promptRuns if provided, otherwise fall back to hook
	const promptRuns = propPromptRuns || hookPromptRuns;
	const isLoading = competitorsLoading || brandLoading || (!propPromptRuns && runsLoading);

	// Check if we have no prompt runs for any prompts in this group after loading is complete
	const promptIds = prompts.map((p) => p.id);
	const groupPromptRuns = promptRuns?.filter((run) => promptIds.includes(run.promptId)) || [];
	const hasNoRuns = !isLoading && groupPromptRuns.length === 0;

	// Calculate visibility data for all prompts in the group
	const groupVisibilityData =
		isLoading || !brand ? [] : calculateGroupVisibilityData(promptRuns || [], prompts, brand, competitors, lookback);

	// Check if there's any non-zero visibility data across all brands and competitors for any prompt in the group
	const hasVisibilityData = groupVisibilityData.some(promptData => {
		return promptData.chartData.some(dataPoint => {
			// Check if any brand (main brand or competitors) has non-zero visibility
			const allBrandIds = [brand?.id, ...(competitors?.map(c => c.id) || [])].filter(Boolean);
			return allBrandIds.some(brandId => {
				const visibility = dataPoint[brandId as string];
				return visibility !== null && visibility !== undefined && Number(visibility) > 0;
			});
		});
	});

	// Create web query mapping for optimization URLs
	const webQueryMapping = promptRuns ? createPromptToWebQueryMapping(promptRuns) : {};

	if (isLoading || !brand) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm">
						{prompts[0]?.groupPrefix}{" "}
						<span className="text-muted-foreground">
							{`<`}
							{prompts[0]?.groupCategory?.toLowerCase()}
							{`>`}
						</span>
					</CardTitle>
					<div className="flex items-center gap-2">
						<Button variant="secondary" size="sm" className="text-xs cursor-pointer p-0 m-0 h-6">
							Loading...
						</Button>
					</div>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="pl-0 pr-6">
					<div className="h-[250px] flex items-center justify-center text-muted-foreground">Loading chart data...</div>
				</CardContent>
			</Card>
		);
	}

	if (hasNoRuns) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm">
						{prompts[0]?.groupPrefix}{" "}
						<span className="text-muted-foreground">
							{`<`}
							{prompts[0]?.groupCategory?.toLowerCase()}
							{`>`}
						</span>
					</CardTitle>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div className="relative">
						<Skeleton className="h-[250px] w-full" />
						<div className="absolute inset-0 flex items-center justify-center">
							<span className="text-sm text-muted-foreground">Evaluating prompt for the first time...</span>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	// Show "No brands found" message when there's no visibility data for any prompts in the group
	if (!hasVisibilityData) {
		return (
			<Card className="py-3 gap-3">
				<CardHeader className="flex justify-between items-center px-3">
					<CardTitle className="text-sm">
						{prompts[0]?.groupPrefix}{" "}
						<span className="text-muted-foreground">
							{`<`}
							{prompts[0]?.groupCategory?.toLowerCase()}
							{`>`}
						</span>
					</CardTitle>
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6">
									Optimize with {WHITE_LABEL_CONFIG.parent_name}
									<IconChevronDown size={12} className="size-3 ml-0.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-100">
								{prompts.map((prompt) => {
									const oldestWebQuery = webQueryMapping[prompt.id];
									const optimizationUrl =
										brand?.id
											? generateOptimizationUrl(prompt.value, brand.id, webSearchEnabled, oldestWebQuery)
											: "#";

									return (
										<DropdownMenuItem key={prompt.id} className="cursor-pointer" asChild>
											<a href={optimizationUrl} target="_blank" rel="noopener noreferrer">
												<div className="flex items-center justify-between w-full text-xs">
													<span>
														optimize{" "}
														<span className="text-muted-foreground">
															{prompts[0]?.groupPrefix} {prompt.value}
														</span>
													</span>
													<IconExternalLink size={12} className="size-3 ml-2" />
												</div>
											</a>
										</DropdownMenuItem>
									);
								})}
								{prompts.length === 0 && (
									<DropdownMenuItem className="cursor-pointer" asChild>
										<a href="#" target="_blank" rel="noopener noreferrer">
											<div className="flex items-center justify-between w-full text-xs">
												<span>
													optimize <span className="text-muted-foreground">{groupName}</span>
												</span>
												<IconExternalLink size={12} className="size-3 ml-2" />
											</div>
										</a>
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</CardHeader>
				<Separator className="py-0 my-0" />
				<CardContent className="px-3">
					<div>
						<span className="font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-muted-foreground">
							No brands found.
						</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="py-3 gap-3">
			<CardHeader className="flex justify-between items-center px-3">
				<CardTitle className="text-sm">
					{prompts[0]?.groupPrefix}{" "}
					<span className="text-muted-foreground">
						{`<`}
						{prompts[0]?.groupCategory?.toLowerCase()}
						{`>`}
					</span>
				</CardTitle>
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6">
								Optimize with {WHITE_LABEL_CONFIG.parent_name}
								<IconChevronDown size={12} className="size-3 ml-0.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-100">
							{groupVisibilityData.map((promptData) => {
								const prompt = prompts.find((p) => p.id === promptData.promptId);
								const oldestWebQuery = webQueryMapping[promptData.promptId];
								const optimizationUrl =
									brand?.id && prompt
										? generateOptimizationUrl(prompt.value, brand.id, webSearchEnabled, oldestWebQuery)
										: "#";

								return (
									<DropdownMenuItem key={promptData.promptId} className="cursor-pointer" asChild>
										<a href={optimizationUrl} target="_blank" rel="noopener noreferrer">
											<div className="flex items-center justify-between w-full text-xs">
												<span>
													optimize{" "}
													<span className="text-muted-foreground">
														{prompts[0]?.groupPrefix} {promptData.promptTitle}
													</span>
												</span>
												<IconExternalLink size={12} className="size-3 ml-2" />
											</div>
										</a>
									</DropdownMenuItem>
								);
							})}
							{groupVisibilityData.length === 0 && (
								<DropdownMenuItem className="cursor-pointer" asChild>
									<a href="#" target="_blank" rel="noopener noreferrer">
										<div className="flex items-center justify-between w-full text-xs">
											<span>
												optimize <span className="text-muted-foreground">{groupName}</span>
											</span>
											<IconExternalLink size={12} className="size-3 ml-2" />
										</div>
									</a>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</CardHeader>
			<Separator className="py-0 my-0" />
			<CardContent className="pl-0 pr-6">
				<div className={`grid grid-cols-1 lg:grid-cols-2 gap-3`}>
					{groupVisibilityData.map((promptData) => (
						<BaseChart
							key={promptData.promptId}
							data={promptData.chartData}
							lookback={lookback}
							title={promptData.promptTitle}
							visibility={promptData.lastVisibility}
							showTitle={true}
							showBadge={true}
							brand={brand}
							competitors={competitors}
							isAnimationActive={false}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
