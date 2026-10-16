import { createFileRoute, Link } from "@tanstack/react-router";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
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

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Side-by-side cards share a header height, so a title beside a control lines up with one beside none. */
const ROW_HEADER = "flex min-h-8 flex-row items-center";

/** The top row's two cards; they sit in the page's grid so their columns line up with the row below. */
function SentimentOverview({ landscape, colors }: { landscape: Landscape; colors: Map<string, string> }) {
	const brand = brandOf(landscape);
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Sentiment</CardTitle>
				</CardHeader>
				<CardContent>
					<RingChart
						center={brand.totals.sentiment === null ? "—" : percent(brand.totals.sentiment)}
						slices={SENTIMENTS.map((sentiment) => ({
							name: SENTIMENT_STYLES[sentiment].label,
							value: brand.sentiments[sentiment],
							color: SENTIMENT_STYLES[sentiment].color,
							emphasis: sentiment === "positive",
						}))}
					/>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Sentiment Trends</CardTitle>
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

function Quotes({ criticism, praise }: { criticism: SentimentQuote[]; praise: SentimentQuote[] }) {
	const [side, setSide] = useState<"criticism" | "praise">(criticism.length > 0 ? "criticism" : "praise");
	const quotes = side === "criticism" ? criticism : praise;
	return (
		<Card>
			<CardHeader className={`${ROW_HEADER} flex-wrap justify-between gap-4`}>
				<CardTitle>What AI Says About You</CardTitle>
				<div role="tablist" aria-label="Sentiment" className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
					{(["criticism", "praise"] as const).map((value) => (
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
					<p className="py-8 text-center text-sm text-muted-foreground">
						{side === "criticism" ? "No negative or mixed answers in this period." : "No positive answers yet."}
					</p>
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

function PromptTable({ prompts }: { prompts: PromptSentiment[] }) {
	const params = useBrandParams();
	return (
		<Card>
			<CardHeader>
				<CardTitle>Sentiment by Prompt</CardTitle>
			</CardHeader>
			<CardContent>
				{prompts.length === 0 ? (
					<p className="py-8 text-center text-sm text-muted-foreground">No prompt mentions you yet.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[40%]">Prompt</TableHead>
								<TableHead className="text-right max-sm:hidden">Mentions</TableHead>
								<TableHead className="w-[28%] max-sm:min-w-16">Sentiment</TableHead>
								<TableHead className="text-right">Positive</TableHead>
								<TableHead className="text-right max-sm:hidden">Negative</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{prompts.map((p) => {
								const clear = sentimentTotal(p.sentiment);
								return (
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
										<TableCell className="text-right tabular-nums text-muted-foreground max-sm:hidden">
											{clear.toLocaleString()}
										</TableCell>
										<TableCell>
											<SentimentBar counts={p.sentiment} className="h-1.5" />
										</TableCell>
										<TableCell className="text-right font-medium tabular-nums">
											{p.sentiment.positiveShare === null ? "—" : percent(p.sentiment.positiveShare)}
										</TableCell>
										<TableCell className="text-right tabular-nums max-sm:hidden">
											{p.sentiment.negative > 0 ? (
												<Link
													to="/app/org/$org/brand/$brand/responses"
													params={params}
													search={(prev) => ({ ...prev, prompts: p.promptId, sentiment: "negative" })}
													className={cn("whitespace-nowrap hover:underline", SENTIMENT_STYLES.negative.text)}
												>
													{p.sentiment.negative} {p.sentiment.negative === 1 ? "answer" : "answers"}
												</Link>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
									</TableRow>
								);
							})}
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
		<p>
			Each answer that mentions your brand is read for its sentiment toward it: positive, neutral, mixed or negative.
			Answers that don't mention you aren't counted. Like visibility, the figures count each prompt's latest answers;
			the prompt table covers the whole period.
		</p>
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
								<CardTitle>Sentiment by Model</CardTitle>
							</CardHeader>
							{/* A long field of competitors scrolls in place rather than stretching the page. */}
							<CardContent className="max-h-[560px] overflow-auto">
								<ModelGrid landscape={landscape} metric="sentiment" />
							</CardContent>
						</Card>
						<Quotes criticism={data.criticism} praise={data.praise} />
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
