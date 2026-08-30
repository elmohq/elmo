import { IconInfoCircle } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type CitationData, CitationsDisplay } from "@/components/citations-display";
import {
	InfoTip,
	QueryWordsSection,
	UnknownQueriesNote,
	type VariationModelCount,
	VariationsList,
} from "@/components/fanout-sections";
import { ListPagination } from "@/components/list-pagination";
import { LookbackSelector, useLookbackPeriod } from "@/components/lookback-selector";
import { ProgressBarChart } from "@/components/progress-bar-chart";
import { ResponseMarkdown } from "@/components/response-markdown";
import { SiteIcon } from "@/components/site-icon";
import { useBrand } from "@/hooks/use-brands";
import { usePromptRunsOnly } from "@/hooks/use-prompt-runs-only";
import { usePromptStats } from "@/hooks/use-prompt-stats";
import { useQueryFanout } from "@/hooks/use-query-fanout";
import { useBrandParams } from "@/hooks/use-route-params";
import { useSiteIcons } from "@/hooks/use-site-icons";
import { getDaysFromLookback } from "@/lib/chart-utils";
import { promptKeywords } from "@/lib/fanout-analysis";
import { PROMPT_DETAIL_TABS, type PromptDetailTab } from "@/lib/prompt-detail-tabs";
import { pageHead } from "@/lib/route-head";
import { skeletonRows } from "@/lib/skeleton-rows";
import { getModelDisplayName } from "@/lib/utils";
import { getPromptMetadataFn } from "@/server/prompts";

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
	nextRunAt?: string | null;
};

const TABS: { key: PromptDetailTab; label: string }[] = [
	{ key: "mentions", label: "Mentions" },
	{ key: "web-queries", label: "Web Queries" },
	{ key: "citations", label: "Citations" },
	{ key: "responses", label: "LLM Responses" },
];

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/prompts/$promptId")({
	staticData: { crumb: "Prompt History" },
	// `tab` is part of the route's search schema so links can target a specific
	// tab (e.g. View Details → web-queries). Absent means the default tab.
	validateSearch: (search: Record<string, unknown>): { tab?: PromptDetailTab } => ({
		tab: PROMPT_DETAIL_TABS.includes(search.tab as PromptDetailTab) ? (search.tab as PromptDetailTab) : undefined,
	}),
	head: pageHead({ title: "Prompt Details", description: "Detailed analysis of a tracked prompt's performance." }),
	component: PromptHistoryPage,
});

function usePromptMetadata(brandId: string, promptId: string) {
	const [promptMeta, setPromptMeta] = useState<PromptMetadata | null>(null);
	const [isMetaLoading, setIsMetaLoading] = useState(true);

	useEffect(() => {
		if (!brandId || !promptId) return;
		setIsMetaLoading(true);
		getPromptMetadataFn({ data: { brandId, promptId } })
			.then((data) => {
				if (data) setPromptMeta(data);
			})
			.catch(console.error)
			.finally(() => setIsMetaLoading(false));
	}, [brandId, promptId]);

	return { promptMeta, isMetaLoading };
}

function PromptHeader({
	promptMeta,
	isMetaLoading,
	onLookbackChange,
}: {
	promptMeta: PromptMetadata | null;
	isMetaLoading: boolean;
	onLookbackChange: () => void;
}) {
	const brandParams = useBrandParams();
	const systemTags = promptMeta?.systemTags || [];
	const userTags = promptMeta?.tags || [];
	const hasTags = systemTags.length > 0 || userTags.length > 0;

	return (
		<div className="pb-6 space-y-3">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex-1 min-w-0">
					{isMetaLoading ? (
						<Skeleton className="h-8 w-[28rem] max-w-full" />
					) : (
						<h1 className="text-2xl font-semibold tracking-tight leading-tight break-words">{promptMeta?.value}</h1>
					)}
				</div>
				<div className="shrink-0">
					<LookbackSelector onLookbackChange={onLookbackChange} />
				</div>
			</div>

			{isMetaLoading ? (
				<div className="flex items-center gap-3">
					<Skeleton className="h-5 w-14" />
					<Skeleton className="h-5 w-40" />
				</div>
			) : (
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
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

					{promptMeta?.nextRunAt && (
						<>
							<span className="text-border">|</span>
							<span className="text-muted-foreground">
								Next run:{" "}
								<span className="text-foreground tabular-nums">
									{new Date(promptMeta.nextRunAt).toLocaleString(undefined, {
										month: "short",
										day: "numeric",
										hour: "numeric",
										minute: "2-digit",
									})}
								</span>
							</span>
						</>
					)}

					{hasTags && <span className="text-border">|</span>}

					{hasTags && (
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground">Tags:</span>
							{systemTags.map((tag) => (
								<Badge key={`sys-${tag}`} variant="secondary" className="text-xs capitalize font-normal">
									{tag}
								</Badge>
							))}
							{userTags.map((tag) => (
								<Badge key={`usr-${tag}`} variant="outline" className="text-xs capitalize font-normal">
									{tag}
								</Badge>
							))}
						</div>
					)}

					<span className="text-border">|</span>

					<Link
						to="/app/org/$org/brand/$brand/settings/prompts"
						params={brandParams}
						className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-foreground/40"
					>
						Edit prompts
					</Link>
				</div>
			)}
		</div>
	);
}

function PromptHistoryPage() {
	const { promptId } = Route.useParams();
	const { brandId } = Route.useRouteContext();

	const lookback = useLookbackPeriod();
	const days = getDaysFromLookback(lookback);

	const activeTab = Route.useSearch({ select: (s) => s.tab ?? "mentions" });
	const navigate = Route.useNavigate();
	const setActiveTab = useCallback(
		(tab: PromptDetailTab) =>
			navigate({
				search: (prev) => ({ ...prev, tab: tab === "mentions" ? undefined : tab }),
				replace: true,
				resetScroll: false,
			}),
		[navigate],
	);
	const [visitedTabs, setVisitedTabs] = useState<Set<PromptDetailTab>>(() => new Set([activeTab]));
	const [currentPage, setCurrentPage] = useState(1);
	const { promptMeta, isMetaLoading } = usePromptMetadata(brandId, promptId);

	const { brand } = useBrand(brandId);
	const { domainFor } = useSiteIcons(brandId);

	// Web Queries fetches its own data (useQueryFanout) — stats only back Mentions/Citations.
	const shouldFetchStats = visitedTabs.has("mentions") || visitedTabs.has("citations");
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

	const handleTabChange = useCallback(
		(tab: PromptDetailTab) => {
			setActiveTab(tab);
			setVisitedTabs((prev) => {
				if (prev.has(tab)) return prev;
				return new Set([...prev, tab]);
			});
		},
		[setActiveTab],
	);

	const handleLookbackChange = useCallback(() => {
		setCurrentPage(1);
	}, []);

	const handlePageChange = (newPage: number) => {
		if (newPage >= 1 && newPage <= (pagination?.totalPages || 1)) {
			setCurrentPage(newPage);
		}
	};

	const mentionStats = aggregations?.mentionStats || [];
	const citationStats = aggregations?.citationStats;

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

	if (!isMetaLoading && !promptMeta) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Prompt Details</h1>
				<Card>
					<CardContent className="pt-6">
						<div className="text-muted-foreground">No prompt data found.</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-0">
			<PromptHeader promptMeta={promptMeta} isMetaLoading={isMetaLoading} onLookbackChange={handleLookbackChange} />

			{/* TABS */}
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

			{/* TAB CONTENT */}
			<div className="pt-6 space-y-6">
				{activeTab === "mentions" && (
					<MentionsTab
						isLoading={isStatsLoading}
						mentionStats={mentionStats}
						totalRuns={aggregations?.totalRuns || 0}
						brandName={brand?.name}
						domainFor={domainFor}
					/>
				)}

				{activeTab === "web-queries" && (
					<WebQueriesTab
						brandId={brandId}
						promptId={promptId}
						promptValue={promptMeta?.value ?? ""}
						lookback={lookback}
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
						domainFor={domainFor}
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
				{skeletonRows(lines).map((row) => (
					<Skeleton key={row} className="h-8 w-full" />
				))}
			</CardContent>
		</Card>
	);
}

function MentionsTab({
	isLoading,
	mentionStats,
	totalRuns,
	brandName,
	domainFor,
}: {
	isLoading: boolean;
	mentionStats: { name: string; count: number }[];
	totalRuns: number;
	brandName?: string;
	domainFor: (name: string) => string | undefined;
}) {
	const brandParams = useBrandParams();

	if (isLoading) return <TabLoadingSkeleton lines={5} />;

	if (mentionStats.length === 0) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				No mention data available for this time period.
			</div>
		);
	}

	const brandMentionPct = Math.round(
		((mentionStats.find((s) => s.name === brandName)?.count || 0) / (totalRuns || 1)) * 100,
	);

	return (
		<Card className="gap-4">
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5 text-base">
					Mentions
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">
							<p>
								Only competitors from your{" "}
								<Link to="/app/org/$org/brand/$brand/settings/competitors" params={brandParams} className="underline">
									tracked competitors list
								</Link>{" "}
								are shown here.
							</p>
							<p className="mt-2">If a competitor isn&apos;t showing up, add them to your list.</p>
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					{brandName} was mentioned in <strong>{brandMentionPct}%</strong> of prompt evaluations (
					{totalRuns.toLocaleString()} total runs).
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent>
				<ProgressBarChart
					items={mentionStats.map((stat) => ({
						label: stat.name,
						count: stat.count,
						icon: <SiteIcon domain={domainFor(stat.name)} size="md" />,
					}))}
					defaultColor="#3b82f6"
					customTotal={totalRuns || 1}
					highlightLabel={brandName}
				/>
			</CardContent>
		</Card>
	);
}

function WebQueriesTab({
	brandId,
	promptId,
	promptValue,
	lookback,
}: {
	brandId: string;
	promptId: string;
	promptValue: string;
	lookback: ReturnType<typeof useLookbackPeriod>;
}) {
	// Same pipeline as the Query Fan-Out page, scoped to this prompt — echo and
	// "unavailable" sentinels filtered, and (unlike the brand-wide page) every
	// variation returned.
	const { data, isLoading, isError } = useQueryFanout(brandId, { lookback, promptId });

	// query → per-model counts, for the inline "2× ChatGPT" breakdown. byModel
	// lists are uncapped in single-prompt mode, so every variation resolves.
	const modelCounts = useMemo(() => {
		const map = new Map<string, VariationModelCount[]>();
		for (const m of data?.byModel ?? []) {
			for (const q of m.topQueries) {
				const entry = map.get(q.query);
				if (entry) entry.push({ model: m.model, count: q.count });
				else map.set(q.query, [{ model: m.model, count: q.count }]);
			}
		}
		for (const counts of map.values()) counts.sort((a, b) => b.count - a.count);
		return map;
	}, [data]);

	if (isLoading && !data) return <TabLoadingSkeleton lines={6} />;
	if (isError && !data) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				Couldn't load web queries right now. Reload the page to try again.
			</div>
		);
	}
	if (!data || data.totalQueries === 0) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				No web query data available for this time period.
			</div>
		);
	}

	return (
		<Tabs defaultValue="fanout" className="gap-4">
			<TabsList>
				<TabsTrigger value="fanout">Prompt Fan-Out</TabsTrigger>
				<TabsTrigger value="words">Query Words</TabsTrigger>
			</TabsList>
			<TabsContent value="fanout">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5 text-base">
							Prompt Fan-Out
							<InfoTip>
								Every distinct search engines ran while answering this prompt, with how many runs each engine issued it.
								Your prompt's keywords are bolded.
							</InfoTip>
						</CardTitle>
						<CardDescription>{data.uniqueQueries.toLocaleString()} distinct searches.</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent>
						<div className="mb-3 space-y-1 empty:hidden">
							<UnknownQueriesNote byModel={data.byModel} />
						</div>
						<VariationsList
							variations={data.topQueries}
							keywords={promptKeywords(promptValue)}
							totalUnique={data.uniqueQueries}
							modelCounts={modelCounts}
						/>
					</CardContent>
				</Card>
			</TabsContent>
			<TabsContent value="words">
				<QueryWordsSection terms={data.terms} wordChanges={data.wordChanges} />
			</TabsContent>
		</Tabs>
	);
}

function CitationsTab({
	isLoading,
	citationStats,
	brandId,
	brandName,
}: {
	isLoading: boolean;
	citationStats: CitationData | undefined;
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
			maxDomains={10}
			maxUrls={50}
		/>
	);
}

function ResponsesTab({
	runs,
	pagination,
	isLoading,
	currentPage,
	onPageChange,
	brandName,
	domainFor,
}: {
	runs: any[];
	pagination: any;
	isLoading: boolean;
	currentPage: number;
	onPageChange: (page: number) => void;
	brandName?: string;
	domainFor: (name: string) => string | undefined;
}) {
	const formatDate = (dateString: string) => new Date(dateString).toLocaleString(undefined, { timeZoneName: "short" });

	const formatRawOutput = (rawOutput: any) =>
		typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput, null, 2);

	if (isLoading && runs.length === 0) {
		return (
			<div className="space-y-4">
				{skeletonRows(3).map((row) => (
					<Card key={row}>
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
			<div className="py-12 text-center text-muted-foreground text-sm">No prompt runs found for this time period.</div>
		);
	}

	return (
		<div className="space-y-4">
			<h3 className="text-base font-medium">Individual Prompt Runs</h3>

			{runs.map((run: any) => (
				<Card key={run.id}>
					<CardHeader className="pb-0 gap-y-0">
						<div className="grid grid-cols-3 gap-x-4 text-sm">
							<div>
								<span className="text-muted-foreground block text-xs mb-0.5">Model</span>
								<span>{getModelDisplayName(run.model)}</span>
							</div>
							<div>
								<span className="text-muted-foreground block text-xs mb-0.5">Version</span>
								<span>{run.version}</span>
							</div>
							<div>
								<span className="text-muted-foreground block text-xs mb-0.5">Evaluated</span>
								<span>{formatDate(run.createdAt)}</span>
							</div>
						</div>
					</CardHeader>
					<Separator />
					<CardContent className="space-y-5">
						{run.webQueries && run.webQueries.length > 0 && (
							<div>
								<span className="text-xs text-muted-foreground block mb-1.5">Web Queries</span>
								<div className="flex flex-wrap gap-1.5">
									{[...new Set<string>(run.webQueries)].map((query) => (
										<Badge key={query} variant="outline" className="text-xs font-normal">
											{query}
										</Badge>
									))}
								</div>
							</div>
						)}

						<div>
							<span className="text-xs text-muted-foreground block mb-1.5">Brands Mentioned</span>
							<div className="flex flex-wrap gap-1.5">
								{run.brandMentioned && brandName && (
									<Badge className="text-xs font-normal">
										<SiteIcon domain={domainFor(brandName)} size="xs" />
										{brandName}
									</Badge>
								)}
								{[...new Set<string>(run.competitorsMentioned ?? [])].map((competitor) => (
									<Badge key={competitor} variant="outline" className="text-xs font-normal">
										<SiteIcon domain={domainFor(competitor)} size="xs" />
										{competitor}
									</Badge>
								))}
								{!run.brandMentioned && (!run.competitorsMentioned || run.competitorsMentioned.length === 0) && (
									<span className="text-xs text-muted-foreground">None</span>
								)}
							</div>
						</div>

						<div>
							<span className="text-xs text-muted-foreground block mb-1.5">LLM Response</span>
							<div className="rounded-md border bg-muted/30 p-4 max-h-64 overflow-auto">
								<ResponseMarkdown>{extractTextContent(run.rawOutput, run.provider ?? run.model)}</ResponseMarkdown>
							</div>
						</div>

						<div>
							<span className="text-xs text-muted-foreground block mb-1.5">Raw Output</span>
							<div className="rounded-md border bg-muted/20 p-4 max-h-64 overflow-auto">
								<pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
									{formatRawOutput(run.rawOutput)}
								</pre>
							</div>
						</div>
					</CardContent>
				</Card>
			))}

			<ListPagination
				page={currentPage - 1}
				pageSize={pagination?.limit ?? 15}
				totalItems={pagination?.total ?? runs.length}
				onPageChange={(p) => onPageChange(p + 1)}
			/>
		</div>
	);
}
