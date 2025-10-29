"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "next/navigation";
import { getModelDisplayName } from "@/lib/utils";

import { useBrand } from "@/hooks/use-brands";
import { usePromptStats } from "@/hooks/use-prompt-stats";
import { usePromptRunsOnly } from "@/hooks/use-prompt-runs-only";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { extractTextContent } from "@/lib/text-extraction";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ProgressBarChart, MODEL_COLORS } from "@/components/progress-bar-chart";
import { CitationsDisplay } from "@/components/citations-display";

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

	// Pagination state
	const [currentPage, setCurrentPage] = useState(1);
	const [daysFilter, setDaysFilter] = useState(7);

	// Get brand data
	const { brand } = useBrand(brandId);

	// Get stats (only reload when days filter changes)
	const { data: statsData, isLoading: isStatsLoading, isError: isStatsError, prompt, aggregations } = usePromptStats(promptId, {
		days: daysFilter
	});

	// Get paginated runs (reload when page or days filter changes)
	const { runs, pagination, isLoading: isRunsLoading, isError: isRunsError } = usePromptRunsOnly(promptId, {
		page: currentPage,
		limit: 15,
		days: daysFilter
	});


	// Handle pagination
	const handlePageChange = (newPage: number) => {
		if (newPage >= 1 && newPage <= (pagination?.totalPages || 1)) {
			setCurrentPage(newPage);
		}
	};

	// Handle days filter change
	const handleDaysFilterChange = (days: number) => {
		setDaysFilter(days);
		setCurrentPage(1); // Reset to first page when filter changes
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

	if (isStatsLoading && isRunsLoading) {
		return (
			<div className="container mx-auto p-6 space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Prompt History</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-4 w-1/2" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (isStatsError || isRunsError) {
		return (
			<div className="container mx-auto p-6 space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Prompt History</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
							Failed to load prompt runs. Please try again.
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!prompt) {
		return (
			<div className="container mx-auto p-6 space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Prompt History</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-muted-foreground">No prompt data found.</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex justify-between items-start">
				<h1 className="text-3xl font-bold">
					{prompt.value} <span className="text-muted-foreground font-normal">(past {daysFilter} days)</span>
				</h1>
				
				{/* Days Filter */}
				<div className="flex gap-2">
					{[7, 14, 30].map((days) => (
						<Button
							key={days}
							variant={daysFilter === days ? "default" : "outline"}
							size="sm"
							onClick={() => handleDaysFilterChange(days)}
							className="cursor-pointer"
						>
							{days}d
						</Button>
					))}
				</div>
			</div>

			{/* Mention Statistics */}
			{mentionStats.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Mentions</CardTitle>
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
			)}

		{/* Web Query Statistics */}
			{(webQueryStats.overall.length > 0 || Object.keys(webQueryStats.byModel).length > 0) && (
				<Card>
					<CardHeader>
						<CardTitle>Web Queries</CardTitle>
						<CardDescription>
							These are the underlying queries used by the LLMs to search for information relevant to the prompt.
						</CardDescription>
					</CardHeader>
					<Separator />

					{/* Overall Web Queries */}
					{webQueryStats.overall.length > 0 && (
						<CardContent className="pb-0">
							<div>
								<h4 className="text-sm font-medium mb-3">All</h4>
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
					{webQueryStats.overall.length > 0 &&
						webQueryStats.byModel &&
						Object.entries(webQueryStats.byModel).filter(([model, queries]) => queries.length > 0).length > 0 && (
							<Separator />
						)}

					{/* Web Queries by Model - in specific order */}
					{webQueryStats.byModel && (() => {
						const modelOrder = ['openai', 'anthropic', 'google'];
						
						const filteredModels = modelOrder.filter(model => 
							webQueryStats.byModel[model] && webQueryStats.byModel[model].length > 0
						);
						
						return filteredModels.map((model, index) => (
							<div key={model}>
								<CardContent className="pb-0">
									<h4 className="text-sm font-medium mb-3">{getModelDisplayName(model)}</h4>
									<ProgressBarChart
										items={webQueryStats.byModel[model].map((query: { name: string; count: number }) => ({
											label: query.name,
											count: query.count,
											category: model,
										}))}
										colorMapping={MODEL_COLORS}
										customTotal={aggregations?.totalRuns || 1}
									/>
								</CardContent>
								{/* Separator between model sections (not after the last one) */}
								{index < filteredModels.length - 1 && <Separator className="mt-6" />}
							</div>
						));
					})()}

			{webQueryStats.overall.length === 0 && Object.keys(webQueryStats.byModel).length === 0 && (
				<CardContent>
					<div className="text-muted-foreground text-center py-8">No web queries found in the prompt runs</div>
				</CardContent>
			)}
		</Card>
	)}

	{/* Citation Statistics */}
	{citationStats && citationStats.totalCitations > 0 && (
		<CitationsDisplay
			citationData={citationStats}
			brandId={brandId}
			brandName={brand?.name}
			showStats={true}
			showPromptBreakdown={false}
			maxDomains={20}
			maxUrls={50}
		/>
	)}

	<div className="flex justify-between items-center">
				<h2 className="text-2xl font-bold">
					Prompt Runs ({pagination?.total || 0})
				</h2>
				
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
