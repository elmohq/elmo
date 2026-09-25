/**
 * Full-text search over every answer the AI engines gave for this brand's
 * prompts, and an analysis of the answers that match: when they appeared,
 * which engines gave them, which prompts drew them, and who else they name.
 */
import { IconChevronRight, IconSearch } from "@tabler/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { InfoTip } from "@/components/fanout-sections";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { ListPagination } from "@/components/list-pagination";
import { FilterSection, PageHeader } from "@/components/page-header";
import { ProgressBarChart } from "@/components/progress-bar-chart";
import { ResponseMarkdown } from "@/components/response-markdown";
import { SiteIcon } from "@/components/site-icon";
import { TrendChart } from "@/components/trend-chart";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useResponseDetail, useResponseSearch } from "@/hooks/use-responses";
import { useBrandParams } from "@/hooks/use-route-params";
import { useSiteIcons } from "@/hooks/use-site-icons";
import { RESPONSES_PAGE_SIZE, snippetSegments } from "@/lib/responses";
import { pageHead } from "@/lib/route-head";
import { getModelDisplayName } from "@/lib/utils";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/responses")({
	staticData: { crumb: "Responses" },
	head: pageHead({
		description: "Search every AI answer to your prompts and see what the matching answers have in common.",
	}),
	component: ResponsesPage,
});

type SearchData = NonNullable<ReturnType<typeof useResponseSearch>["data"]>;
type Match = SearchData["matches"][number];

const formatPct = (value: number) => `${Math.round(value * 100)}%`;
const formatDateTime = (value: string) =>
	new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function ResponsesPage() {
	const brandId = useBrandId();
	const { model, lookback, tags, search } = useListFilters();
	const query = search.trim();

	const { data: brand } = useBrand(brandId);
	const { domainFor } = useSiteIcons(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;

	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const availableTags = promptsSummary?.availableTags ?? [];

	// A new search starts from its first page.
	const filterKey = JSON.stringify([query, lookback, modelParam, tags]);
	const [paging, setPaging] = useState({ filterKey, page: 0 });
	const page = paging.filterKey === filterKey ? paging.page : 0;
	const setPage = (next: number) => setPaging({ filterKey, page: next });

	const { data, isLoading, error } = useResponseSearch(brandId, {
		query,
		lookback,
		model: modelParam,
		tags,
		page,
	});
	const [openRunId, setOpenRunId] = useState<string | null>(null);

	const infoContent = (
		<p>
			Every answer the AI engines gave to your prompts, searchable by word or phrase. Put a phrase in "quotes" to match
			it exactly, use <em>or</em> to match either term, and a leading minus to exclude a word.
		</p>
	);

	let content: React.ReactNode;
	if (isLoading && !data) {
		content = <LoadingState />;
	} else if (error && !data) {
		content = <EmptyState message="Couldn't load responses right now. Reload the page to try again." />;
	} else if (!data || data.totalRuns === 0) {
		content = (
			<EmptyState message="No responses for the selected filters yet. Responses appear once your prompts have been run." />
		);
	} else {
		content = (
			<div className="space-y-6">
				{data.indexing && (
					<Alert>
						<AlertDescription>
							Older responses are still being indexed for search, so some matches may be missing for now.
						</AlertDescription>
					</Alert>
				)}
				<StatRow data={data} />
				{data.query && data.matchedRuns > 0 && <Analysis data={data} domainFor={domainFor} />}
				<Matches
					data={data}
					page={page}
					onPageChange={setPage}
					onOpen={setOpenRunId}
					brandName={brand?.name}
					domainFor={domainFor}
				/>
			</div>
		);
	}

	return (
		<PageHeader
			title="Responses"
			subtitle="Search and analyze every AI answer to your prompts."
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar
					availableTags={availableTags}
					trackedTargets={trackedTargets}
					showSearch
					searchPlaceholder="Search responses..."
					showModelSelector
				/>
			</FilterSection>
			<TooltipProvider delay={150}>{content}</TooltipProvider>
			<ResponseSheet
				brandId={brandId}
				runId={openRunId}
				onClose={() => setOpenRunId(null)}
				brandName={brand?.name}
				domainFor={domainFor}
			/>
		</PageHeader>
	);
}

function StatCard({ label, value, detail, tip }: { label: string; value: string; detail?: string; tip: string }) {
	return (
		<Card className="py-4">
			<CardContent>
				<div className="text-muted-foreground flex items-center gap-1 text-sm">
					{label}
					<InfoTip>{tip}</InfoTip>
				</div>
				<div className="mt-1.5 text-3xl font-bold tabular-nums">{value}</div>
				{detail && <div className="text-muted-foreground mt-0.5 text-xs">{detail}</div>}
			</CardContent>
		</Card>
	);
}

function StatRow({ data }: { data: SearchData }) {
	const searching = data.query !== null;
	return (
		<div className="grid gap-4 sm:grid-cols-3">
			<StatCard
				label={searching ? "Matching Responses" : "Responses"}
				value={data.matchedRuns.toLocaleString()}
				detail={
					searching
						? `${formatPct(data.totalRuns > 0 ? data.matchedRuns / data.totalRuns : 0)} of ${data.totalRuns.toLocaleString()} responses`
						: undefined
				}
				tip={
					searching
						? "Answers containing your search, out of every answer in the selected period."
						: "Answers the AI engines gave to your prompts in the selected period."
				}
			/>
			<StatCard
				label="Prompts"
				value={data.byPrompt.length.toLocaleString()}
				tip={searching ? "Prompts with at least one matching answer." : "Prompts with at least one answer."}
			/>
			<StatCard
				label="Brand Mentioned"
				value={data.brandMentionRate === null ? "—" : formatPct(data.brandMentionRate)}
				tip={
					searching
						? "How many of the matching answers also mention your brand."
						: "How many of these answers mention your brand."
				}
			/>
		</div>
	);
}

function Analysis({ data, domainFor }: { data: SearchData; domainFor: (name: string) => string | undefined }) {
	const params = useBrandParams();
	const navigate = useNavigate();
	const series = data.series.map((point) => ({
		date: point.date,
		value: point.runs > 0 ? Math.round((point.matched / point.runs) * 1000) / 10 : null,
	}));

	return (
		<>
			<div className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5 text-base">
							Over Time
							<InfoTip>The share of each day's answers that contain your search.</InfoTip>
						</CardTitle>
						<CardDescription>How often answers contain "{data.query}".</CardDescription>
					</CardHeader>
					<CardContent>
						<TrendChart data={series} label="Matching" color="#2563eb" className="aspect-auto h-[180px] w-full" />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5 text-base">
							By Engine
							<InfoTip>Matching answers from each engine, and their share of that engine's answers.</InfoTip>
						</CardTitle>
						<CardDescription>Which engines say it.</CardDescription>
					</CardHeader>
					<CardContent>
						<ProgressBarChart
							items={data.byModel.map((row) => ({
								label: getModelDisplayName(row.model),
								icon: <ModelIcon iconId={getModelMeta(row.model).iconId} className="size-4 shrink-0" />,
								count: row.matched,
								suffix: (
									<span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
										{formatPct(row.runs > 0 ? row.matched / row.runs : 0)}
									</span>
								),
							}))}
							percentageMode="max"
						/>
					</CardContent>
				</Card>
			</div>
			<div className="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5 text-base">
							Top Prompts
							<InfoTip>The prompts whose answers match most often.</InfoTip>
						</CardTitle>
						<CardDescription>Where it comes up.</CardDescription>
					</CardHeader>
					<CardContent>
						<ProgressBarChart
							items={data.byPrompt.slice(0, 8).map((row) => ({
								label: row.promptValue || "(untitled prompt)",
								count: row.matched,
								subtitle: `${row.matched.toLocaleString()} of ${row.runs.toLocaleString()} responses`,
								onClick: () =>
									navigate({
										to: "/app/org/$org/brand/$brand/prompts/$promptId",
										params: { ...params, promptId: row.promptId },
										search: { tab: "responses" },
									}),
							}))}
							percentageMode="max"
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5 text-base">
							Competitors Mentioned
							<InfoTip>Tracked competitors named in the matching answers, and how many of them name each.</InfoTip>
						</CardTitle>
						<CardDescription>Who else appears alongside it.</CardDescription>
					</CardHeader>
					<CardContent>
						{data.competitors.length === 0 ? (
							<div className="text-muted-foreground py-6 text-center text-sm">
								No tracked competitors appear in these answers.
							</div>
						) : (
							<ProgressBarChart
								items={data.competitors.slice(0, 8).map((row) => ({
									label: row.name,
									icon: <SiteIcon domain={domainFor(row.name)} size="xs" />,
									count: row.matched,
									suffix: (
										<span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
											{formatPct(row.matched / data.matchedRuns)}
										</span>
									),
								}))}
								percentageMode="total"
								customTotal={data.matchedRuns}
							/>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}

function Snippet({ snippet }: { snippet: string | null }) {
	if (snippet === null) {
		return <p className="text-muted-foreground text-sm italic">This response hasn't been indexed yet.</p>;
	}
	let offset = 0;
	const segments = snippetSegments(snippet).map((segment) => {
		const start = offset;
		offset += segment.text.length;
		return { ...segment, start };
	});
	if (segments.length === 0) {
		return <p className="text-muted-foreground text-sm italic">No answer text.</p>;
	}
	return (
		<p className="text-muted-foreground line-clamp-3 text-sm">
			{segments.map((segment) =>
				segment.highlighted ? (
					<mark
						key={segment.start}
						className="text-foreground rounded-sm bg-yellow-200/70 px-0.5 dark:bg-yellow-500/30"
					>
						{segment.text}
					</mark>
				) : (
					<span key={segment.start}>{segment.text}</span>
				),
			)}
		</p>
	);
}

function MentionBadges({
	brandMentioned,
	competitors,
	brandName,
	domainFor,
}: {
	brandMentioned: boolean;
	competitors: string[];
	brandName?: string;
	domainFor: (name: string) => string | undefined;
}) {
	if (!brandMentioned && competitors.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-1.5">
			{brandMentioned && brandName && (
				<Badge className="text-xs font-normal">
					<SiteIcon domain={domainFor(brandName)} size="xs" />
					{brandName}
				</Badge>
			)}
			{competitors.map((competitor) => (
				<Badge key={competitor} variant="outline" className="text-xs font-normal">
					<SiteIcon domain={domainFor(competitor)} size="xs" />
					{competitor}
				</Badge>
			))}
		</div>
	);
}

function Matches({
	data,
	page,
	onPageChange,
	onOpen,
	brandName,
	domainFor,
}: {
	data: SearchData;
	page: number;
	onPageChange: (page: number) => void;
	onOpen: (runId: string) => void;
	brandName?: string;
	domainFor: (name: string) => string | undefined;
}) {
	return (
		<Card className="gap-4">
			<CardHeader>
				<CardTitle className="text-base">{data.query ? "Matching Responses" : "Latest Responses"}</CardTitle>
				<CardDescription>
					{data.query ? "Newest first. Open one to read the full answer." : "Search above to find specific wording."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{data.matches.length === 0 ? (
					<div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
						<IconSearch className="size-5" />
						No responses contain "{data.query}" in this period.
					</div>
				) : (
					<div className="divide-border divide-y">
						{data.matches.map((match) => (
							<MatchRow key={match.id} match={match} onOpen={onOpen} brandName={brandName} domainFor={domainFor} />
						))}
					</div>
				)}
				<ListPagination
					page={page}
					pageSize={RESPONSES_PAGE_SIZE}
					totalItems={data.matchedRuns}
					onPageChange={onPageChange}
				/>
			</CardContent>
		</Card>
	);
}

function MatchRow({
	match,
	onOpen,
	brandName,
	domainFor,
}: {
	match: Match;
	onOpen: (runId: string) => void;
	brandName?: string;
	domainFor: (name: string) => string | undefined;
}) {
	return (
		<button
			type="button"
			onClick={() => onOpen(match.id)}
			className="hover:bg-muted/50 group flex w-full cursor-pointer items-start gap-3 rounded-sm px-2 py-3 text-left"
		>
			<ModelIcon iconId={getModelMeta(match.model).iconId} className="mt-0.5 size-4 shrink-0" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<div className="flex items-baseline justify-between gap-4">
					<span className="truncate text-sm font-medium" title={match.promptValue}>
						{match.promptValue || "(untitled prompt)"}
					</span>
					<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
						{getModelDisplayName(match.model)} · {formatDateTime(match.createdAt)}
					</span>
				</div>
				<Snippet snippet={match.snippet} />
				<MentionBadges
					brandMentioned={match.brandMentioned}
					competitors={match.competitorsMentioned}
					brandName={brandName}
					domainFor={domainFor}
				/>
			</div>
			<IconChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0 opacity-0 group-hover:opacity-100" />
		</button>
	);
}

function ResponseSheet({
	brandId,
	runId,
	onClose,
	brandName,
	domainFor,
}: {
	brandId: string;
	runId: string | null;
	onClose: () => void;
	brandName?: string;
	domainFor: (name: string) => string | undefined;
}) {
	const { data: run, isLoading, error } = useResponseDetail(brandId, runId);

	return (
		<Sheet open={runId !== null} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full gap-0 sm:max-w-2xl">
				<SheetHeader className="border-b">
					<SheetTitle className="flex items-center gap-2">
						{run && <ModelIcon iconId={getModelMeta(run.model).iconId} className="size-4" />}
						{run ? getModelDisplayName(run.model) : "Response"}
					</SheetTitle>
					<SheetDescription>{run && formatDateTime(run.createdAt)}</SheetDescription>
				</SheetHeader>
				<div className="flex-1 space-y-5 overflow-y-auto p-4">
					{isLoading && (
						<div className="space-y-2">
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					)}
					{!isLoading && !run && (
						<div className="text-muted-foreground text-sm">
							{error ? "Couldn't load this response. Try again." : "This response is no longer available."}
						</div>
					)}
					{run && (
						<>
							<MentionBadges
								brandMentioned={run.brandMentioned}
								competitors={run.competitorsMentioned}
								brandName={brandName}
								domainFor={domainFor}
							/>
							<div className="rounded-md border bg-muted/30 p-4">
								<ResponseMarkdown>{run.text ?? "No answer text."}</ResponseMarkdown>
							</div>
							{run.citations.length > 0 && (
								<div>
									<span className="text-muted-foreground mb-1.5 block text-xs">Citations</span>
									<ol className="space-y-1 text-sm">
										{run.citations.map((citation) => (
											<li key={`${citation.citationIndex}-${citation.url}`} className="flex items-center gap-2">
												<SiteIcon domain={citation.domain} size="xs" />
												<a
													href={citation.url}
													target="_blank"
													rel="noopener noreferrer"
													className="truncate hover:underline"
													title={citation.url}
												>
													{citation.title || citation.url}
												</a>
											</li>
										))}
									</ol>
								</div>
							)}
							<BrandPromptLink
								promptId={run.promptId}
								search={{ tab: "responses" }}
								className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
							>
								All responses to this prompt
								<IconChevronRight className="size-3.5" />
							</BrandPromptLink>
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function LoadingState() {
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-3">
				{["a", "b", "c"].map((k) => (
					<Card key={k} className="py-4">
						<CardContent className="space-y-2">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-8 w-16" />
						</CardContent>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-48" />
				</CardHeader>
				<CardContent className="space-y-4">
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</CardContent>
			</Card>
		</div>
	);
}

function EmptyState({ message }: { message: string }) {
	return (
		<Card>
			<CardContent className="py-8">
				<div className="text-muted-foreground text-center">{message}</div>
			</CardContent>
		</Card>
	);
}
