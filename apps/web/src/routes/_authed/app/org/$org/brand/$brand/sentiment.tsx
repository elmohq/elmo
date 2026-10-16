import { IconArrowDown, IconArrowUp, IconInfoCircle } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo, useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { CompanyTrendChart } from "@/components/company-trend-chart";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { ModelGrid } from "@/components/overview/competitive-landscape";
import { FilterSection, PageHeader } from "@/components/page-header";
import { InlineMarkdown } from "@/components/response-markdown";
import { RingChart } from "@/components/ring-chart";
import { SentimentBar } from "@/components/sentiment-filter";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrandSentiment } from "@/hooks/use-brand-sentiment";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import { useCompetitiveLandscape } from "@/hooks/use-share-of-voice";
import { useCompanyColors } from "@/lib/company-colors";
import { brandOf, chartedCompanies, type Landscape } from "@/lib/landscape";
import { METRIC_META } from "@/lib/overview-metrics";
import { pageHead } from "@/lib/route-head";
import { SENTIMENT_STYLES, SENTIMENTS, sentimentTotal } from "@/lib/sentiment";
import type { PromptSentiment, SentimentQuote } from "@/server/analytics-core";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/sentiment")({
	staticData: { crumb: "Sentiment" },
	head: pageHead({ description: "See how AI answers describe your brand when they mention it." }),
	component: SentimentPage,
});

/** Side-by-side cards share a header height, so a title beside a control lines up with one beside none. */
const ROW_HEADER = "flex min-h-8 flex-row items-center";

function TitleWithInfo({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<CardTitle className="flex items-center gap-1.5">
			{title}
			<Tooltip>
				<TooltipTrigger
					aria-label={`About ${title}`}
					render={<IconInfoCircle className="size-3.5 cursor-help text-muted-foreground" />}
				/>
				<TooltipContent className="max-w-xs text-sm font-normal">{children}</TooltipContent>
			</Tooltip>
		</CardTitle>
	);
}

/** The top row's two cards; they sit in the page's grid so their columns line up with the row below. */
function SentimentOverview({ landscape, colors }: { landscape: Landscape; colors: Map<string, string> }) {
	const brand = brandOf(landscape);
	return (
		<>
			<Card>
				<CardHeader>
					<TitleWithInfo title="Sentiment">
						How AI answers that mention you describe you, from each prompt's latest answers. The number in the middle is
						your score out of 100: 50 is neutral, higher means more praise than criticism.
					</TitleWithInfo>
				</CardHeader>
				<CardContent>
					<RingChart
						center={brand.totals.sentiment === null ? "—" : METRIC_META.sentiment.format(brand.totals.sentiment)}
						slices={SENTIMENTS.map((sentiment) => ({
							name: SENTIMENT_STYLES[sentiment].label,
							value: brand.sentiments[sentiment],
							color: SENTIMENT_STYLES[sentiment].color,
							emphasis: false,
						}))}
					/>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<TitleWithInfo title="Sentiment Trends">
						Your sentiment score each day beside your closest competitors'. A company only has a score on days when an
						answer mentions it.
					</TitleWithInfo>
				</CardHeader>
				<CardContent>
					<CompanyTrendChart
						dates={landscape.dates}
						companies={chartedCompanies(landscape, "sentiment").map((c) => ({
							name: c.name,
							isBrand: c.isBrand,
							color: colors.get(c.name) ?? "#94a3b8",
							values: c.series.sentiment,
						}))}
						format={METRIC_META.sentiment.format}
						height={220}
					/>
				</CardContent>
			</Card>
		</>
	);
}

const QUOTE_SIDES = {
	praise: "No positive answers in this period.",
	mixed: "No mixed answers in this period.",
	criticism: "No negative answers in this period.",
} as const;

type QuoteSide = keyof typeof QUOTE_SIDES;

function Quotes({ quotesBySide }: { quotesBySide: Record<QuoteSide, SentimentQuote[]> }) {
	const [side, setSide] = useState<QuoteSide>("praise");
	const quotes = quotesBySide[side];
	return (
		<Card>
			<CardHeader className={`${ROW_HEADER} flex-wrap justify-between gap-4`}>
				<TitleWithInfo title="What AI Says About You">
					The passages from this period where AI speaks of you most clearly, at most one per prompt. Click a prompt to
					see the full answer.
				</TitleWithInfo>
				<div role="tablist" aria-label="Sentiment" className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
					{(Object.keys(QUOTE_SIDES) as QuoteSide[]).map((value) => (
						<button
							key={value}
							type="button"
							role="tab"
							aria-selected={side === value}
							onClick={() => setSide(value)}
							className={cn(
								"rounded-md px-3 py-1 capitalize transition-colors",
								side === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
							)}
						>
							{value}
						</button>
					))}
				</div>
			</CardHeader>
			<CardContent>
				{quotes.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">{QUOTE_SIDES[side]}</p>
				) : (
					<div className="divide-y">
						{quotes.map((quote) => (
							<QuoteRow key={quote.runId} quote={quote} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function QuoteRow({ quote }: { quote: SentimentQuote }) {
	const { label, iconId } = getModelMeta(quote.model);
	return (
		<figure className="flex gap-3 py-3 first:pt-0 last:pb-0">
			<span
				className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/40"
				title={label}
			>
				<ModelIcon iconId={iconId} className="size-3.5" />
			</span>
			<div className="min-w-0 space-y-1">
				<blockquote className="line-clamp-3 text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_strong]:font-semibold">
					<InlineMarkdown>{quote.passage}</InlineMarkdown>
				</blockquote>
				<figcaption className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					<span className={cn("shrink-0 font-medium", SENTIMENT_STYLES[quote.sentiment].text)}>
						{SENTIMENT_STYLES[quote.sentiment].label}
					</span>
					<span>·</span>
					<BrandPromptLink
						promptId={quote.promptId}
						search={{ tab: "responses", sentiment: quote.sentiment }}
						className="truncate hover:text-foreground hover:underline"
					>
						{quote.prompt || "(untitled prompt)"}
					</BrandPromptLink>
					<span>·</span>
					<span className="shrink-0">{new Date(quote.createdAt).toLocaleDateString()}</span>
				</figcaption>
			</div>
		</figure>
	);
}

type PromptSortKey = "mentions" | "score" | "positive" | "negative";

interface PromptSort {
	key: PromptSortKey;
	desc: boolean;
}

const PROMPT_SORT_VALUE: Record<PromptSortKey, (p: PromptSentiment) => number> = {
	mentions: (p) => sentimentTotal(p.sentiment),
	score: (p) => p.sentiment.score ?? 0,
	positive: (p) => p.sentiment.positive,
	negative: (p) => p.sentiment.negative,
};

function SortableHead({
	className,
	sortKey,
	label,
	sort,
	onSort,
}: {
	className?: string;
	sortKey: PromptSortKey;
	label: string;
	sort: PromptSort;
	onSort: (key: PromptSortKey) => void;
}) {
	const active = sort.key === sortKey;
	const Arrow = sort.desc ? IconArrowDown : IconArrowUp;
	return (
		<TableHead
			className={cn("text-right", className)}
			aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
		>
			<button
				type="button"
				onClick={() => onSort(sortKey)}
				className={cn(
					"inline-flex cursor-pointer items-center gap-1 hover:text-foreground",
					active ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{/* The arrow's space is held when inactive so headers don't shift as the sort moves. */}
				<Arrow className={cn("size-3.5", !active && "invisible")} />
				{label}
			</button>
		</TableHead>
	);
}

/** Links a sentiment's count to the prompt's answers with that sentiment. */
function SentimentAnswersLink({ prompt, sentiment }: { prompt: PromptSentiment; sentiment: "positive" | "negative" }) {
	const params = useBrandParams();
	const count = prompt.sentiment[sentiment];
	if (count === 0) return <span className="text-muted-foreground">—</span>;
	return (
		<Link
			to="/app/org/$org/brand/$brand/responses"
			params={params}
			search={(prev) => ({ ...prev, prompts: prompt.promptId, sentiment })}
			className={cn("whitespace-nowrap hover:underline", SENTIMENT_STYLES[sentiment].text)}
		>
			{count} {count === 1 ? "answer" : "answers"}
		</Link>
	);
}

function PromptTable({ prompts }: { prompts: PromptSentiment[] }) {
	const [sort, setSort] = useState<PromptSort>({ key: "score", desc: true });
	const onSort = (key: PromptSortKey) =>
		setSort((prev) => (prev.key === key ? { key, desc: !prev.desc } : { key, desc: true }));
	const rows = useMemo(() => {
		const value = PROMPT_SORT_VALUE[sort.key];
		const dir = sort.desc ? -1 : 1;
		// Ties fall back to mentions, most first, so better-evidenced prompts lead.
		return [...prompts].sort(
			(a, b) => dir * (value(a) - value(b)) || PROMPT_SORT_VALUE.mentions(b) - PROMPT_SORT_VALUE.mentions(a),
		);
	}, [prompts, sort]);
	return (
		<Card>
			<CardHeader>
				<TitleWithInfo title="Sentiment by Prompt">
					Every answer in the period that mentions you, grouped by prompt. Mentions counts those answers, the score is
					out of 100 as above, and the bar splits them into positive, neutral, mixed and negative.
				</TitleWithInfo>
			</CardHeader>
			<CardContent>
				{prompts.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">No prompt mentions you yet.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[40%]">Prompt</TableHead>
								<TableHead className="w-[24%] max-sm:min-w-16">Sentiment</TableHead>
								<SortableHead
									className="max-sm:hidden"
									sortKey="mentions"
									label="Mentions"
									sort={sort}
									onSort={onSort}
								/>
								<SortableHead sortKey="score" label="Score" sort={sort} onSort={onSort} />
								<SortableHead
									className="max-sm:hidden"
									sortKey="positive"
									label="Positive"
									sort={sort}
									onSort={onSort}
								/>
								<SortableHead
									className="max-sm:hidden"
									sortKey="negative"
									label="Negative"
									sort={sort}
									onSort={onSort}
								/>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((p) => (
								<TableRow key={p.promptId}>
									<TableCell className="whitespace-normal">
										<BrandPromptLink
											promptId={p.promptId}
											search={{ tab: "responses" }}
											className="font-medium hover:underline"
										>
											{p.value || "(untitled prompt)"}
										</BrandPromptLink>
										{p.tags.length > 0 && <div className="text-xs text-muted-foreground">{p.tags.join(" · ")}</div>}
									</TableCell>
									<TableCell>
										<SentimentBar counts={p.sentiment} className="h-1.5" />
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground max-sm:hidden">
										{sentimentTotal(p.sentiment).toLocaleString()}
									</TableCell>
									<TableCell className="text-right font-medium tabular-nums">
										{p.sentiment.score === null ? "—" : METRIC_META.sentiment.format(p.sentiment.score)}
									</TableCell>
									<TableCell className="text-right tabular-nums max-sm:hidden">
										<SentimentAnswersLink prompt={p} sentiment="positive" />
									</TableCell>
									<TableCell className="text-right tabular-nums max-sm:hidden">
										<SentimentAnswersLink prompt={p} sentiment="negative" />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function SentimentPage() {
	const brandId = useBrandId();
	const { model, lookback, tags } = useListFilters();
	const { data: brand } = useBrand(brandId);
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;
	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const filters = { lookback, model: modelParam, tags };
	const { data, isLoading, error } = useBrandSentiment(brandId, filters);
	const { data: landscape, error: landscapeError } = useCompetitiveLandscape(brandId, filters);
	const colors = useCompanyColors(landscape);

	const infoContent = (
		<div className="space-y-2">
			<p>When an AI answer mentions your brand, it's read as positive, neutral, mixed or negative toward you.</p>
			<p>
				The score turns those into a number out of 100: positive answers count 100, neutral and mixed 50, negative 0. So
				50 means neutral overall, and above 50 means more praise than criticism.
			</p>
			<p>Answers that don't mention you aren't counted.</p>
		</div>
	);

	let content: React.ReactNode;
	if ((error && !data) || (landscapeError && !landscape)) {
		content = (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					Couldn't load sentiment right now. Reload the page to try again.
				</CardContent>
			</Card>
		);
	} else if ((isLoading && !data) || !landscape) {
		content = <Skeleton className="h-[320px] w-full" />;
	} else if (!data || brandOf(landscape).totals.sentiment === null) {
		content = (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					No answers mention you for the selected filters yet.
				</CardContent>
			</Card>
		);
	} else {
		content = (
			<TooltipProvider delay={150}>
				<div className="flex flex-col gap-6">
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-[auto_minmax(0,1fr)]">
						<SentimentOverview landscape={landscape} colors={colors} />
						<Card>
							<CardHeader className={ROW_HEADER}>
								<TitleWithInfo title="Sentiment by Model">
									Each company's sentiment score in each AI model's latest answers. "All" combines every model. A dash
									means that model hasn't mentioned the company.
								</TitleWithInfo>
							</CardHeader>
							{/* A long field of competitors scrolls in place rather than stretching the page. */}
							<CardContent className="max-h-[560px] overflow-auto">
								<ModelGrid landscape={landscape} metric="sentiment" />
							</CardContent>
						</Card>
						<Quotes quotesBySide={data} />
					</div>
					<PromptTable prompts={data.prompts} />
				</div>
			</TooltipProvider>
		);
	}

	return (
		<PageHeader
			title="Sentiment"
			subtitle="How AI answers describe your brand when they mention it."
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar
					availableTags={promptsSummary?.availableTags ?? []}
					trackedTargets={brand?.trackedTargets ?? []}
					showSearch={false}
					showModelSelector
				/>
			</FilterSection>
			{content}
		</PageHeader>
	);
}
