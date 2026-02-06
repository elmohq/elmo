"use client";

import { useState, useEffect, useCallback } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useParams } from "next/navigation";
import { getModelDisplayName } from "@/lib/utils";
import { useBrand } from "@/hooks/use-brands";
import { usePromptStats } from "@/hooks/use-prompt-stats";
import { usePromptRunsOnly } from "@/hooks/use-prompt-runs-only";
import { Separator } from "@workspace/ui/components/separator";
import { Button } from "@workspace/ui/components/button";
import { extractTextContent } from "@workspace/lib/text-extraction";
import {
	IconChevronLeft,
	IconChevronRight,
	IconInfoCircle,
} from "@tabler/icons-react";
import { ProgressBarChart, MODEL_COLORS } from "@/components/progress-bar-chart";
import { CitationsDisplay } from "@/components/citations-display";
import { LookbackSelector, useLookbackPeriod } from "@/components/lookback-selector";
import { getDaysFromLookback } from "@/lib/chart-utils";
import ReactMarkdown from "react-markdown";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@workspace/ui/components/tooltip";
import Link from "next/link";
import { isSystemTag } from "@workspace/lib/tag-utils";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

type PromptMetadata = {
	id: string;
	brandId: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
};

type TabKey = "mentions" | "web-queries" | "citations" | "responses";

const TABS: { key: TabKey; label: string }[] = [
	{ key: "mentions", label: "Mentions" },
	{ key: "web-queries", label: "Web Queries" },
	{ key: "citations", label: "Citations" },
	{ key: "responses", label: "LLM Responses" },
];

// -------------------------------------------------------------------
// Main Page
// -------------------------------------------------------------------

export default function PromptHistoryPage() {
	const params = useParams();
	const brandId = params.brand as string;
	const promptId = params.promptId as string;

	// Lookback period from URL state
	const lookback = useLookbackPeriod();
	const days = getDaysFromLookback(lookback);

	// Tab state
	const [activeTab, setActiveTab] = useState<TabKey>("mentions");
	const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(
		new Set(["mentions"]),
	);

	// Pagination state for the responses tab
	const [currentPage, setCurrentPage] = useState(1);

	// Prompt metadata (loaded on mount)
	const [promptMeta, setPromptMeta] = useState<PromptMetadata | null>(null);
	const [isMetaLoading, setIsMetaLoading] = useState(true);

	// Brand data
	const { brand } = useBrand(brandId);

	// ---- Lazy data fetching ------------------------------------------
	const shouldFetchStats =
		visitedTabs.has("mentions") ||
		visitedTabs.has("web-queries") ||
		visitedTabs.has("citations");

	const {
		isLoading: isStatsLoading,
		isError: isStatsError,
		aggregations,
	} = usePromptStats(shouldFetchStats ? promptId : "", { days });

	const shouldFetchRuns = visitedTabs.has("responses");

	const {
		runs,
		pagination,
		isLoading: isRunsLoading,
		isError: isRunsError,
	} = usePromptRunsOnly(shouldFetchRuns ? promptId : "", {
		page: currentPage,
		limit: 15,
		days,
	});

	// ---- Fetch prompt metadata on mount ------------------------------
	useEffect(() => {
		if (!brandId || !promptId) return;

		setIsMetaLoading(true);
		fetch(`/api/brands/${brandId}/prompts/${promptId}`)
			.then((res) => {
				if (!res.ok) throw new Error("Failed to load prompt");
				return res.json();
			})
			.then((data) => {
				setPromptMeta({
					id: data.id,
					brandId: data.brandId,
					value: data.value,
					enabled: data.enabled,
					tags: data.tags || [],
					systemTags: data.systemTags || [],
				});
			})
			.catch(console.error)
			.finally(() => setIsMetaLoading(false));
	}, [brandId, promptId]);

	// ---- Tab change handler ------------------------------------------
	const handleTabChange = useCallback((tab: TabKey) => {
		setActiveTab(tab);
		setVisitedTabs((prev) => {
			if (prev.has(tab)) return prev;
			return new Set([...prev, tab]);
		});
	}, []);

	// ---- Lookback change — reset pagination --------------------------
	const handleLookbackChange = useCallback(() => {
		setCurrentPage(1);
	}, []);

	// ---- Pagination --------------------------------------------------
	const handlePageChange = (newPage: number) => {
		if (newPage >= 1 && newPage <= (pagination?.totalPages || 1)) {
			setCurrentPage(newPage);
		}
	};

	// ---- Derived stats -----------------------------------------------
	const mentionStats = aggregations?.mentionStats || [];
	const webQueryStats = aggregations?.webQueryStats || {
		overall: [],
		byModel: {},
	};
	const citationStats = aggregations?.citationStats;

	// ---- Combine tags for display ------------------------------------
	const systemTags = promptMeta?.systemTags || [];
	const userTags = promptMeta?.tags || [];
	const hasTags = systemTags.length > 0 || userTags.length > 0;

	// ---- Error state -------------------------------------------------
	if (isStatsError || isRunsError) {
		return (
			<div className="space-y-6">
				<div className="flex justify-between items-start">
					<h1 className="text-3xl font-bold">Prompt Details</h1>
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

	// ---- Not found ---------------------------------------------------
	if (!isMetaLoading && !promptMeta) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Prompt Details</h1>
				<Card>
					<CardContent className="pt-6">
						<div className="text-muted-foreground">
							No prompt data found.
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-0">
			{/* ============================================================
			    HEADER
			    ============================================================ */}
			<div className="pb-6 space-y-3">
				{/* Title + lookback row */}
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex-1 min-w-0">
						{isMetaLoading ? (
							<Skeleton className="h-8 w-[28rem] max-w-full" />
						) : (
							<h1 className="text-2xl font-semibold tracking-tight leading-tight break-words">
								{promptMeta?.value}
							</h1>
						)}
					</div>
					<div className="shrink-0">
						<LookbackSelector
							onLookbackChange={handleLookbackChange}
						/>
					</div>
				</div>

				{/* Meta: status, tags, edit link */}
				{isMetaLoading ? (
					<div className="flex items-center gap-3">
						<Skeleton className="h-5 w-14" />
						<Skeleton className="h-5 w-40" />
					</div>
				) : (
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
						{/* Status */}
						{promptMeta?.enabled ? (
							<span className="inline-flex items-center gap-1.5 text-green-700">
								<span className="relative flex h-2 w-2">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
									<span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
								</span>
								Active
							</span>
						) : (
							<span className="text-muted-foreground">Disabled</span>
						)}

						{/* Divider */}
						{hasTags && (
							<span className="text-border">|</span>
						)}

						{/* Tags */}
						{hasTags && (
							<div className="flex items-center gap-1.5">
								<span className="text-muted-foreground">Tags:</span>
								{systemTags.map((tag) => (
									<Badge
										key={`sys-${tag}`}
										variant="secondary"
										className="text-xs capitalize font-normal"
									>
										{tag}
									</Badge>
								))}
								{userTags.map((tag) => (
									<Badge
										key={`usr-${tag}`}
										variant="outline"
										className="text-xs capitalize font-normal"
									>
										{tag}
									</Badge>
								))}
							</div>
						)}

						{/* Divider */}
						<span className="text-border">|</span>

						{/* Edit link */}
						<Link
							href={`/app/${brandId}/settings/prompts`}
							className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-foreground/40"
						>
							Edit prompts
						</Link>
					</div>
				)}
			</div>

			{/* ============================================================
			    TABS (underline style)
			    ============================================================ */}
			<div className="border-b border-border">
				<div className="flex items-end justify-between">
					<nav className="-mb-px flex gap-6" aria-label="Tabs">
						{TABS.map(({ key, label }) => (
							<button
								key={key}
								type="button"
								onClick={() => handleTabChange(key)}
								className={`cursor-pointer whitespace-nowrap pb-3 text-sm font-medium transition-colors border-b-2 ${
									activeTab === key
										? "border-foreground text-foreground"
										: "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
								}`}
							>
								{label}
							</button>
						))}
					</nav>
					{aggregations?.totalRuns != null && (
						<span className="pb-3 text-xs text-muted-foreground tabular-nums">
							{aggregations.totalRuns.toLocaleString()} runs in period
						</span>
					)}
				</div>
			</div>

			{/* ============================================================
			    TAB CONTENT
			    ============================================================ */}
			<div className="pt-6 space-y-6">
				{activeTab === "mentions" && (
					<MentionsTab
						isLoading={isStatsLoading}
						mentionStats={mentionStats}
						totalRuns={aggregations?.totalRuns || 0}
						brandName={brand?.name}
						brandId={brandId}
					/>
				)}

				{activeTab === "web-queries" && (
					<WebQueriesTab
						isLoading={isStatsLoading}
						webQueryStats={webQueryStats}
						totalRuns={aggregations?.totalRuns || 0}
					/>
				)}

				{activeTab === "citations" && (
					<CitationsTab
						isLoading={isStatsLoading}
						citationStats={citationStats}
						brandId={brandId}
						brandName={brand?.name}
					/>
				)}

				{activeTab === "responses" && (
					<ResponsesTab
						runs={runs}
						pagination={pagination}
						isLoading={isRunsLoading}
						currentPage={currentPage}
						onPageChange={handlePageChange}
						brandName={brand?.name}
					/>
				)}
			</div>
		</div>
	);
}

// =====================================================================
// Tab Content Components
// =====================================================================

function TabLoadingSkeleton({ lines = 3 }: { lines?: number }) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-32 mb-2" />
				<Skeleton className="h-4 w-80" />
			</CardHeader>
			<Separator />
			<CardContent className="space-y-4 pt-6">
				{Array.from({ length: lines }).map((_, i) => (
					<Skeleton key={i} className="h-8 w-full" />
				))}
			</CardContent>
		</Card>
	);
}

// -------------------------------------------------------------------
// Mentions Tab
// -------------------------------------------------------------------

function MentionsTab({
	isLoading,
	mentionStats,
	totalRuns,
	brandName,
	brandId,
}: {
	isLoading: boolean;
	mentionStats: { name: string; count: number }[];
	totalRuns: number;
	brandName?: string;
	brandId: string;
}) {
	if (isLoading) return <TabLoadingSkeleton lines={5} />;

	if (mentionStats.length === 0) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				No mention data available for this time period.
			</div>
		);
	}

	const brandMentionPct = Math.round(
		((mentionStats.find((s) => s.name === brandName)?.count || 0) /
			(totalRuns || 1)) *
			100,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5 text-base">
					Mentions
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-sm font-normal">
							<p>
								Only competitors from your{" "}
								<Link
									href={`/app/${brandId}/settings/competitors`}
									className="underline"
								>
									tracked competitors list
								</Link>{" "}
								are shown here.
							</p>
							<p className="mt-2">
								If a competitor isn&apos;t showing up, add them
								to your list.
							</p>
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					{brandName} was mentioned in{" "}
					<strong>{brandMentionPct}%</strong> of prompt evaluations
					({totalRuns.toLocaleString()} total runs).
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="pt-6">
				<ProgressBarChart
					items={mentionStats.map((stat) => ({
						label: stat.name,
						count: stat.count,
					}))}
					defaultColor="#3b82f6"
					customTotal={totalRuns || 1}
					highlightLabel={brandName}
				/>
			</CardContent>
		</Card>
	);
}

// -------------------------------------------------------------------
// Web Queries Tab
// -------------------------------------------------------------------

function WebQueriesTab({
	isLoading,
	webQueryStats,
	totalRuns,
}: {
	isLoading: boolean;
	webQueryStats: {
		overall: { name: string; count: number }[];
		byModel: Record<string, { name: string; count: number }[]>;
	};
	totalRuns: number;
}) {
	if (isLoading) return <TabLoadingSkeleton lines={6} />;

	const hasAnyQueries =
		webQueryStats.overall.length > 0 ||
		Object.values(webQueryStats.byModel).some((q) => q.length > 0);

	if (!hasAnyQueries) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				No web query data available for this time period.
			</div>
		);
	}

	const modelOrder = ["openai", "anthropic", "google"];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5 text-base">
					Web Queries
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-sm font-normal">
							<p className="mb-2">
								The number next to each query represents how
								many times it was made when evaluating this
								prompt.
							</p>
							<p>
								LLMs can make multiple web queries per
								evaluation, and sometimes the same queries
								appear across different evaluations.
							</p>
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					Underlying queries used by the LLMs to search for
					information relevant to the prompt.
				</CardDescription>
			</CardHeader>
			<Separator />

			{/* Overall */}
			{webQueryStats.overall.length > 0 && (
				<CardContent className="pb-0">
					<h4 className="text-sm font-medium mb-1">All</h4>
					<p className="text-xs text-muted-foreground mb-3">
						Counts show how many times each query appeared across{" "}
						{totalRuns.toLocaleString()} prompt runs
					</p>
					<ProgressBarChart
						items={webQueryStats.overall.map((q) => ({
							label: q.name,
							count: q.count,
						}))}
						defaultColor="#8b5cf6"
						customTotal={totalRuns || 1}
					/>
				</CardContent>
			)}

			{webQueryStats.overall.length > 0 && <Separator />}

			{/* By Model */}
			{modelOrder.map((model, index) => {
				const hasQueries =
					webQueryStats.byModel?.[model] &&
					webQueryStats.byModel[model].length > 0;

				return (
					<div key={model}>
						<CardContent className="pb-0">
							<h4 className="text-sm font-medium mb-3">
								{getModelDisplayName(model)}
							</h4>
							{hasQueries ? (
								<ProgressBarChart
									items={webQueryStats.byModel[model].map(
										(q: {
											name: string;
											count: number;
										}) => ({
											label: q.name,
											count: q.count,
											category: model,
										}),
									)}
									colorMapping={MODEL_COLORS}
									customTotal={totalRuns || 1}
								/>
							) : (
								<div className="text-muted-foreground text-sm py-4 px-3 bg-muted/50 rounded-md">
									No web queries were made by{" "}
									{getModelDisplayName(model)} for this
									prompt.
								</div>
							)}
						</CardContent>
						{index < modelOrder.length - 1 && (
							<Separator className="mt-6" />
						)}
					</div>
				);
			})}
		</Card>
	);
}

// -------------------------------------------------------------------
// Citations Tab
// -------------------------------------------------------------------

function CitationsTab({
	isLoading,
	citationStats,
	brandId,
	brandName,
}: {
	isLoading: boolean;
	citationStats:
		| {
				totalCitations: number;
				uniqueDomains: number;
				brandCitations: number;
				competitorCitations: number;
				socialMediaCitations: number;
				otherCitations: number;
				domainDistribution: any[];
				specificUrls: any[];
		  }
		| undefined;
	brandId: string;
	brandName?: string;
}) {
	if (isLoading) return <TabLoadingSkeleton lines={6} />;

	if (!citationStats || citationStats.totalCitations === 0) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				No citation data available for this time period.
			</div>
		);
	}

	return (
		<CitationsDisplay
			citationData={citationStats}
			brandId={brandId}
			brandName={brandName}
			showStats={true}
			maxDomains={20}
			maxUrls={50}
		/>
	);
}

// -------------------------------------------------------------------
// LLM Responses Tab
// -------------------------------------------------------------------

function ResponsesTab({
	runs,
	pagination,
	isLoading,
	currentPage,
	onPageChange,
	brandName,
}: {
	runs: any[];
	pagination: any;
	isLoading: boolean;
	currentPage: number;
	onPageChange: (page: number) => void;
	brandName?: string;
}) {
	const formatDate = (dateString: string) =>
		new Date(dateString).toLocaleString(undefined, {
			timeZoneName: "short",
		});

	const formatRawOutput = (rawOutput: any) =>
		typeof rawOutput === "string"
			? rawOutput
			: JSON.stringify(rawOutput, null, 2);

	const PaginationControls = ({ className }: { className?: string }) =>
		pagination && pagination.totalPages > 1 ? (
			<div className={`flex items-center gap-2 ${className || ""}`}>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={!pagination.hasPrev || isLoading}
					className="cursor-pointer disabled:cursor-not-allowed"
				>
					<IconChevronLeft className="h-4 w-4" />
					Previous
				</Button>
				<span className="text-sm text-muted-foreground tabular-nums">
					Page {pagination.page} of {pagination.totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage + 1)}
					disabled={!pagination.hasNext || isLoading}
					className="cursor-pointer disabled:cursor-not-allowed"
				>
					Next
					<IconChevronRight className="h-4 w-4" />
				</Button>
			</div>
		) : null;

	if (isLoading && runs.length === 0) {
		return (
			<div className="space-y-4">
				{Array.from({ length: 3 }).map((_, i) => (
					<Card key={i}>
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
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (runs.length === 0) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				No prompt runs found for this time period.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Header + top pagination */}
			<div className="flex justify-between items-center">
				<h3 className="text-base font-medium">Individual Prompt Runs</h3>
				<PaginationControls />
			</div>

			{/* Run cards */}
			{runs.map((run: any) => (
				<Card key={run.id}>
					<CardHeader className="pb-0 gap-y-0">
						<div className="grid grid-cols-3 gap-x-4 text-sm">
							<div>
								<span className="text-muted-foreground block text-xs mb-0.5">
									Model Group
								</span>
								<span>{getModelDisplayName(run.modelGroup)}</span>
							</div>
							<div>
								<span className="text-muted-foreground block text-xs mb-0.5">
									Model
								</span>
								<span>{run.model}</span>
							</div>
							<div>
								<span className="text-muted-foreground block text-xs mb-0.5">
									Evaluated
								</span>
								<span>{formatDate(run.createdAt)}</span>
							</div>
						</div>
					</CardHeader>
					<Separator />
					<CardContent className="space-y-5">
						{run.webQueries && run.webQueries.length > 0 && (
							<div>
								<span className="text-xs text-muted-foreground block mb-1.5">
									Web Queries
								</span>
								<div className="flex flex-wrap gap-1.5">
									{run.webQueries.map(
										(query: string, qIndex: number) => (
											<Badge
												key={qIndex}
												variant="outline"
												className="text-xs font-normal"
											>
												{query}
											</Badge>
										),
									)}
								</div>
							</div>
						)}

						<div>
							<span className="text-xs text-muted-foreground block mb-1.5">
								Brands Mentioned
							</span>
							<div className="flex flex-wrap gap-1.5">
								{run.brandMentioned && brandName && (
									<Badge className="text-xs font-normal">
										{brandName}
									</Badge>
								)}
								{run.competitorsMentioned?.map(
									(competitor: string, cIndex: number) => (
										<Badge
											key={cIndex}
											variant="outline"
											className="text-xs font-normal"
										>
											{competitor}
										</Badge>
									),
								)}
								{!run.brandMentioned &&
									(!run.competitorsMentioned ||
										run.competitorsMentioned.length === 0) && (
										<span className="text-xs text-muted-foreground">
											None
										</span>
									)}
							</div>
						</div>

						<div>
							<span className="text-xs text-muted-foreground block mb-1.5">
								LLM Response
							</span>
							<div className="rounded-md border bg-muted/30 p-4 max-h-64 overflow-auto prose prose-sm max-w-none">
								<ReactMarkdown>
									{extractTextContent(
										run.rawOutput,
										run.modelGroup,
									)}
								</ReactMarkdown>
							</div>
						</div>

						<div>
							<span className="text-xs text-muted-foreground block mb-1.5">
								Raw Output
							</span>
							<div className="rounded-md border bg-muted/20 p-4 max-h-64 overflow-auto">
								<pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
									{formatRawOutput(run.rawOutput)}
								</pre>
							</div>
						</div>
					</CardContent>
				</Card>
			))}

			{/* Bottom pagination */}
			<PaginationControls className="justify-center pt-4" />
		</div>
	);
}
