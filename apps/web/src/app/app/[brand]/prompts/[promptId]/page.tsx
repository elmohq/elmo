"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useParams } from "next/navigation";
import { getModelDisplayName } from "@/lib/utils";

import { useBrand } from "@/hooks/use-brands";
import { usePromptStats } from "@/hooks/use-prompt-stats";
import { usePromptRunsOnly } from "@/hooks/use-prompt-runs-only";
import { PromptTagEditor } from "@/components/prompt-tag-editor";
import { Separator } from "@workspace/ui/components/separator";
import { Button } from "@workspace/ui/components/button";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ProgressBarChart, MODEL_COLORS } from "@/components/progress-bar-chart";
import { CitationsDisplay } from "@/components/citations-display";
import { LookbackSelector, useLookbackPeriod } from "@/components/lookback-selector";
import { getDaysFromLookback } from "@/lib/chart-utils";
import ReactMarkdown from "react-markdown";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import Link from "next/link";

type PromptRun = {
	id: string;
	promptId: string;
	modelGroup: string;
	model: string;
	webSearchEnabled: boolean;
	rawOutput: any;
	webQueries: string[];
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: string;
};

type PromptRunsResponse = {
	prompt: {
		id: string;
		brandId: string;
		value: string;
	};
	runs: PromptRun[];
};

export default function PromptHistoryPage() {
	const params = useParams();
	const brandId = params.brand as string;
	const promptId = params.promptId as string;

	// Use lookback period from URL state (defaults to 1m if > 1 week of data, else 1w)
	const lookback = useLookbackPeriod();
	const days = getDaysFromLookback(lookback);

	// Pagination state
	const [currentPage, setCurrentPage] = useState(1);
	
	// Tags state (fetched from API)
	const [promptTags, setPromptTags] = useState<string[]>([]);

	// Get brand data
	const { brand } = useBrand(brandId);

	// Get stats (only reload when days filter changes)
	const { data: statsData, isLoading: isStatsLoading, isError: isStatsError, prompt: statsPrompt, aggregations } = usePromptStats(promptId, {
		days
	});

	// Get paginated runs (reload when page or days filter changes) - this loads faster and includes prompt
	const { runs, pagination, prompt: runsPrompt, isLoading: isRunsLoading, isError: isRunsError } = usePromptRunsOnly(promptId, {
		page: currentPage,
		limit: 15,
		days
	});

	// Use prompt from runs API (faster) or fall back to stats API
	const prompt = runsPrompt || statsPrompt;

	// Fetch prompt tags (tags are now stored on the prompt, including system tags)
	useEffect(() => {
		if (!brandId || !promptId) return;
		
		fetch(`/api/brands/${brandId}/prompts/${promptId}`)
			.then((res) => res.json())
			.then((data) => {
				if (data.tags) {
					setPromptTags(data.tags);
				}
			})
			.catch(console.error);
	}, [brandId, promptId]);


	// Handle pagination
	const handlePageChange = (newPage: number) => {
		if (newPage >= 1 && newPage <= (pagination?.totalPages || 1)) {
			setCurrentPage(newPage);
		}
	};

	// Handle lookback change - reset to first page
	const handleLookbackChange = () => {
		setCurrentPage(1);
	};

	const formatRawOutput = (rawOutput: any) => {
		if (typeof rawOutput === "string") {
			return rawOutput;
		}
		return JSON.stringify(rawOutput, null, 2);
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleString(undefined, {
			timeZoneName: "short",
		});
	};

	// Get aggregated data from server (already calculated)
	const mentionStats = aggregations?.mentionStats || [];
	const webQueryStats = aggregations?.webQueryStats || { overall: [], byModel: {} };
	const webSearchSummary = aggregations?.webSearchSummary || { enabled: 0, disabled: 0, percentage: 0 };
	const citationStats = aggregations?.citationStats;

	// Show error state
	if (isStatsError || isRunsError) {
		return (
			<div className="space-y-6">
				<div className="flex justify-between items-start">
					<h1 className="text-3xl font-bold">Prompt History</h1>
					<LookbackSelector onLookbackChange={handleLookbackChange} />
				</div>
				<Card>
					<CardContent className="pt-6">
						<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
							Failed to load prompt data. Please try again.
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	// Show "not found" only if we're done loading and truly have no prompt
	if (!isStatsLoading && !prompt) {
		return (
			<div className="space-y-6">
				<div className="flex justify-between items-start">
					<h1 className="text-3xl font-bold">Prompt History</h1>
					<LookbackSelector onLookbackChange={handleLookbackChange} />
				</div>
				<Card>
					<CardContent className="pt-6">
						<div className="text-muted-foreground">No prompt data found.</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex justify-between items-start">
				<div className="space-y-2 flex-1 mr-4">
					{prompt ? (
						<h1 className="text-3xl font-bold">
							{prompt.value}
						</h1>
					) : (
						<Skeleton className="h-10 w-96" />
					)}
					{/* Tags */}
					<PromptTagEditor
						brandId={brandId}
						promptId={promptId}
						currentTags={promptTags}
						onTagsUpdated={setPromptTags}
					/>
				</div>
				
				{/* Lookback Period Selector */}
				<LookbackSelector onLookbackChange={handleLookbackChange} />
			</div>

			{/* Mention Statistics */}
			{isStatsLoading ? (
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-32 mb-2" />
						<Skeleton className="h-4 w-96" />
					</CardHeader>
					<Separator />
					<CardContent className="space-y-4">
						<Skeleton className="h-32 w-full" />
					</CardContent>
				</Card>
			) : mentionStats.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5">
							Mentions
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-sm font-normal">
									<p>Only competitors from your <Link href={`/app/${brandId}/settings/competitors`} className="underline">tracked competitors list</Link> are shown here.</p>
									<p className="mt-2">If a competitor isn&apos;t showing up, add them to your list.</p>
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>
							{brand?.name} was mentioned in{" "}
							<strong>
								{Math.round(
									((mentionStats.find((stat) => stat.name === brand?.name)?.count || 0) /
										(aggregations?.totalRuns || 1)) *
										100,
								)}
								%
							</strong>{" "}
							of prompt evaluations.
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent className="space-y-4">
						<ProgressBarChart
							items={mentionStats.map((stat) => ({
								label: stat.name,
								count: stat.count,
							}))}
							defaultColor="#3b82f6"
							customTotal={aggregations?.totalRuns || 1}
							highlightLabel={brand?.name}
						/>
					</CardContent>
				</Card>
			) : null}

		{/* Web Query Statistics */}
			{isStatsLoading ? (
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-32 mb-2" />
						<Skeleton className="h-4 w-full" />
					</CardHeader>
					<Separator />
					<CardContent className="space-y-4">
						<Skeleton className="h-48 w-full" />
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5">
							Web Queries
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-sm font-normal">
									<p className="mb-2">The number next to each query represents how many times it was made when evaluating this prompt.</p>
									<p>LLMs can make multiple web queries per evaluation, and sometimes the same queries appear across different evaluations.</p>
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>
							These are the underlying queries used by the LLMs to search for information relevant to the prompt.
						</CardDescription>
					</CardHeader>
					<Separator />

					{/* Overall Web Queries */}
					{webQueryStats.overall.length > 0 && (
						<CardContent className="pb-0">
							<div>
								<h4 className="text-sm font-medium mb-1">All</h4>
								<p className="text-xs text-muted-foreground mb-3">Counts show how many times each query appeared across {(aggregations?.totalRuns || 0).toLocaleString()} prompt runs</p>
								<ProgressBarChart
									items={webQueryStats.overall.map((query) => ({
										label: query.name,
										count: query.count,
									}))}
									defaultColor="#8b5cf6"
									customTotal={aggregations?.totalRuns || 1}
								/>
							</div>
						</CardContent>
					)}

					{/* Separator between overall and model-specific queries */}
					{webQueryStats.overall.length > 0 && <Separator />}

					{/* Web Queries by Model - show all models, even those without queries */}
					{(() => {
						const modelOrder = ['openai', 'anthropic', 'google'];
						
						return modelOrder.map((model, index) => {
							const hasQueries = webQueryStats.byModel?.[model] && webQueryStats.byModel[model].length > 0;
							
							return (
								<div key={model}>
									<CardContent className="pb-0">
										<h4 className="text-sm font-medium mb-3">{getModelDisplayName(model)}</h4>
										{hasQueries ? (
											<ProgressBarChart
												items={webQueryStats.byModel[model].map((query: { name: string; count: number }) => ({
													label: query.name,
													count: query.count,
													category: model,
												}))}
												colorMapping={MODEL_COLORS}
												customTotal={aggregations?.totalRuns || 1}
											/>
										) : (
											<div className="text-muted-foreground text-sm py-4 px-3 bg-muted/50 rounded-md">
												No web queries were made by {getModelDisplayName(model)} for this prompt.
											</div>
										)}
									</CardContent>
									{/* Separator between model sections (not after the last one) */}
									{index < modelOrder.length - 1 && <Separator className="mt-6" />}
								</div>
							);
						});
					})()}
				</Card>
			)}

	{/* Citation Statistics */}
	{isStatsLoading ? (
		<Card>
			<CardHeader>
				<Skeleton className="h-6 w-32 mb-2" />
				<Skeleton className="h-4 w-64" />
			</CardHeader>
			<Separator />
			<CardContent className="space-y-4">
				<Skeleton className="h-64 w-full" />
			</CardContent>
		</Card>
	) : citationStats && citationStats.totalCitations > 0 ? (
		<CitationsDisplay
			citationData={citationStats}
			brandId={brandId}
			brandName={brand?.name}
			showStats={true}
			maxDomains={20}
			maxUrls={50}
		/>
	) : null}

	{/* Prompt Runs Section */}
	<div className="flex justify-between items-center">
				{isRunsLoading && !pagination ? (
					<Skeleton className="h-8 w-48" />
				) : (
					<h2 className="text-2xl font-bold">
						Prompt Runs ({(pagination?.total || 0).toLocaleString()})
					</h2>
				)}
				
				{/* Pagination Controls */}
				{!isRunsLoading && pagination && pagination.totalPages > 1 && (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => handlePageChange(currentPage - 1)}
							disabled={!pagination.hasPrev || isRunsLoading}
							className="cursor-pointer disabled:cursor-not-allowed"
						>
							<IconChevronLeft className="h-4 w-4" />
							Previous
						</Button>
						
						<span className="text-sm text-muted-foreground">
							Page {pagination.page} of {pagination.totalPages}
						</span>
						
						<Button
							variant="outline"
							size="sm"
							onClick={() => handlePageChange(currentPage + 1)}
							disabled={!pagination.hasNext || isRunsLoading}
							className="cursor-pointer disabled:cursor-not-allowed"
						>
							Next
							<IconChevronRight className="h-4 w-4" />
						</Button>
					</div>
				)}
			</div>

			{isRunsLoading ? (
				<div className="space-y-6">
					{/* Loading skeletons for runs */}
					{Array.from({ length: 3 }).map((_, index) => (
						<Card key={index} className="border border-gray-200 shadow-sm">
							<CardHeader className="pb-0 gap-y-0">
								<div className="grid grid-cols-3 gap-x-4">
									<div>
										<Skeleton className="h-4 w-20 mb-1" />
										<Skeleton className="h-4 w-16" />
									</div>
									<div>
										<Skeleton className="h-4 w-16 mb-1" />
										<Skeleton className="h-4 w-24" />
									</div>
									<div>
										<Skeleton className="h-4 w-20 mb-1" />
										<Skeleton className="h-4 w-32" />
									</div>
								</div>
							</CardHeader>
							<Separator />
							<CardContent className="space-y-4">
								<Skeleton className="h-20 w-full" />
								<Skeleton className="h-16 w-full" />
							</CardContent>
						</Card>
					))}
				</div>
			) : runs.length === 0 ? (
				<p className="text-muted-foreground">No prompt runs found for this prompt.</p>
			) : (
				<div className="space-y-6">
					{runs.map((run, index) => (
						<Card key={run.id} className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
							<CardHeader className="pb-0 gap-y-0">
								<div className="grid grid-cols-3 gap-x-4">
									<div>
										<strong className="text-sm text-gray-700 block">Model Group</strong>
										<span className="text-sm text-gray-600">{getModelDisplayName(run.modelGroup)}</span>
									</div>
									<div>
										<strong className="text-sm text-gray-700 block">Model</strong>
										<span className="text-sm text-gray-600">{run.model}</span>
									</div>
									<div>
										<strong className="text-sm text-gray-700 block">Evaluated</strong>
										<span className="text-sm text-gray-600">{formatDate(run.createdAt)}</span>
									</div>
								</div>
							</CardHeader>
							<Separator />
							<CardContent className="space-y-6">
								{run.webQueries && run.webQueries.length > 0 && (
									<div>
										<strong className="text-sm text-gray-700 block mb-2">Web Queries</strong>
										<div className="flex flex-wrap gap-2">
											{run.webQueries.map((query, qIndex) => (
												<Badge key={qIndex} variant="outline" className="text-xs">
													{query}
												</Badge>
											))}
										</div>
									</div>
								)}

								<div>
									<strong className="text-sm text-gray-700 block mb-2">Brands Mentioned</strong>
									<div className="flex flex-wrap gap-2">
										{run.brandMentioned && brand?.name && <Badge className="text-xs">{brand.name}</Badge>}
										{run.competitorsMentioned &&
											run.competitorsMentioned.map((competitor, cIndex) => (
												<Badge key={cIndex} variant="outline" className="text-xs">
													{competitor}
												</Badge>
											))}
										{!run.brandMentioned && (!run.competitorsMentioned || run.competitorsMentioned.length === 0) && (
											<Badge variant="secondary" className="text-xs">
												None
											</Badge>
										)}
									</div>
								</div>

								<div>
									<strong className="text-sm text-gray-700 block mb-2">Formatted LLM Response</strong>
									<div className="bg-green-50 border border-green-200 rounded-lg p-4 max-h-64 overflow-auto prose prose-sm max-w-none">
										<ReactMarkdown>
											{extractTextContent(run.rawOutput, run.modelGroup)}
										</ReactMarkdown>
									</div>
								</div>

								<div>
									<strong className="text-sm text-gray-700 block mb-2">Generated Text</strong>
									<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-h-64 overflow-auto">
										<pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
											{extractTextContent(run.rawOutput, run.modelGroup)}
										</pre>
									</div>
								</div>

								<div>
									<strong className="text-sm text-gray-700 block mb-2">Raw LLM Output</strong>
									<div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-auto">
										<pre className="text-xs text-gray-700 font-mono leading-relaxed">
											{formatRawOutput(run.rawOutput)}
										</pre>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
					
					{/* Bottom Pagination Controls */}
					{!isRunsLoading && pagination && pagination.totalPages > 1 && (
						<div className="flex justify-center items-center gap-2 pt-4">
							<Button
								variant="outline"
								size="sm"
								onClick={() => handlePageChange(currentPage - 1)}
								disabled={!pagination.hasPrev || isRunsLoading}
								className="cursor-pointer disabled:cursor-not-allowed"
							>
								<IconChevronLeft className="h-4 w-4" />
								Previous
							</Button>
							
							<span className="text-sm text-muted-foreground">
								Page {pagination.page} of {pagination.totalPages}
							</span>
							
							<Button
								variant="outline"
								size="sm"
								onClick={() => handlePageChange(currentPage + 1)}
								disabled={!pagination.hasNext || isRunsLoading}
								className="cursor-pointer disabled:cursor-not-allowed"
							>
								Next
								<IconChevronRight className="h-4 w-4" />
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
