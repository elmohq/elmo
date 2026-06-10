/**
 * /app/$brand/query-fanout - Query Fanout
 *
 * "What are the answer engines really searching for?" When an engine answers a
 * tracked prompt it may run several web searches first. KPIs summarize how much
 * prompts expand, then three tabs: Prompt Fanout (each prompt's searches, with
 * its keywords bolded), Query Words (the cloud + which words engines add/drop/keep),
 * and Query Visibility (searches you're missing vs win).
 *
 * Read-only from `prompt_runs.web_queries`, with Google AI Mode's fan-out
 * reconstructed from its cited `google.com/search?q=` links. See
 * `server/query-fanout.ts` and `lib/fanout-analysis.ts`.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Separator } from "@workspace/ui/components/separator";
import { Switch } from "@workspace/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Input } from "@workspace/ui/components/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { IconChevronDown, IconChevronRight, IconInfoCircle, IconSearch } from "@tabler/icons-react";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { getModelDisplayName } from "@/lib/utils";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useQueryFanout } from "@/hooks/use-query-fanout";
import { PageHeader, FilterSection } from "@/components/page-header";
import { FilterBar, usePageFilters } from "@/components/filter-bar";
import { ProgressBarChart } from "@/components/progress-bar-chart";
import { WordCloud } from "@/components/word-cloud";
import { WON_MENTION_THRESHOLD, isStopword, type FanoutQueryStat, type PromptFanoutStat, type WordChangeStat } from "@/lib/fanout-analysis";

export const Route = createFileRoute("/_authed/app/$brand/query-fanout")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Query Fanout", { appName, brandName }) },
				{
					name: "description",
					content: "See the web searches AI engines run when answering your prompts, and how they rewrite your wording.",
				},
			],
		};
	},
	component: QueryFanoutPage,
});

const PURPLE = "#8b5cf6";

function QueryFanoutPage() {
	const { brand: brandId } = Route.useParams();
	const { selectedLookback, selectedTags } = usePageFilters();

	const { promptsSummary } = usePromptsSummary(brandId, { lookback: selectedLookback });
	const availableTags = promptsSummary?.availableTags ?? [];

	const { data, isLoading, isError } = useQueryFanout(brandId, { lookback: selectedLookback, tags: selectedTags });

	const infoContent = (
		<p>
			When an AI engine with web search capabilities responds to a prompt, it may choose to make a number of web searches
			before creating its answer. These underlying web searches, or web queries, are only available for some engines.
		</p>
	);

	let content: React.ReactNode;
	if (isLoading && !data) {
		content = <LoadingState />;
	} else if (isError && !data) {
		content = <EmptyState message="Couldn't load query fan-out right now. Reload the page to try again." />;
	} else if (!data || data.totalRuns === 0) {
		// totalRuns counts only web-search-enabled runs — a brand whose models all
		// run without web search lands here even with plenty of runs.
		content = (
			<EmptyState message="No runs with web search enabled for the selected filters. Fan-out appears once your prompts have been run by an engine with web search." />
		);
	} else if (data.totalQueries === 0) {
		// Runs happened but none exposed fan-out — still show the KPIs (run counts)
		// above the explanation rather than hiding everything.
		content = (
			<TooltipProvider delayDuration={150}>
				<div className="space-y-6">
					<StatRow data={data} />
					<EmptyState message="No web queries in this period — the engines you track didn't expose any searches for these prompts and filters." />
				</div>
			</TooltipProvider>
		);
	} else {
		content = (
			<TooltipProvider delayDuration={150}>
				<div className="space-y-6">
					<StatRow data={data} />
					<Tabs defaultValue="fanout" className="gap-4">
						<TabsList>
							<TabsTrigger value="fanout">Prompt Fanout</TabsTrigger>
							<TabsTrigger value="words">Query Words</TabsTrigger>
							<TabsTrigger value="visibility">Query Visibility</TabsTrigger>
						</TabsList>
						<TabsContent value="fanout">
							<Prompts prompts={data.byPrompt} brandId={brandId} />
						</TabsContent>
						<TabsContent value="words">
							<QueryWords data={data} />
						</TabsContent>
						<TabsContent value="visibility">
							<QueryVisibility data={data} />
						</TabsContent>
					</Tabs>
				</div>
			</TooltipProvider>
		);
	}

	return (
		<PageHeader title="Query Fanout" subtitle="The web searches AI engines run when answering your prompts." infoContent={infoContent}>
			<FilterSection>
				<FilterBar availableTags={availableTags} availableModels={[]} showSearch={false} showModelSelector={false} />
			</FilterSection>
			{content}
		</PageHeader>
	);
}

type FanoutData = NonNullable<ReturnType<typeof useQueryFanout>["data"]>;

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function InfoTip({ children }: { children: React.ReactNode }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="cursor-help">
					<IconInfoCircle className="text-muted-foreground/60 size-3.5" />
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs text-sm font-normal">{children}</TooltipContent>
		</Tooltip>
	);
}

function StatCard({ label, value, tip }: { label: string; value: React.ReactNode; tip: React.ReactNode }) {
	return (
		<Card className="py-4">
			<CardContent>
				<div className="text-muted-foreground flex items-center gap-1 text-sm">
					{label}
					<InfoTip>{tip}</InfoTip>
				</div>
				<div className="mt-1.5 text-3xl font-bold tabular-nums">{value}</div>
			</CardContent>
		</Card>
	);
}

function RunsTooltip({ breakdown, reconstructed }: { breakdown: FanoutData["byModel"]; reconstructed: Set<string> }) {
	return (
		<>
			<p>
				Prompt runs that produced at least one web search. Some engines do not expose web searches, so this number may be
				lower than expected.
			</p>
			{breakdown.length > 0 && (
				<div className="border-border/60 mt-2 space-y-0.5 border-t pt-2">
					{breakdown.map((m) => (
						<div key={m.model} className="flex items-center justify-between gap-3">
							<span>
								{getModelDisplayName(m.model)}
								{reconstructed.has(m.model) ? " (reconstructed)" : ""}
							</span>
							<span className="tabular-nums">{m.fanoutRuns.toLocaleString()}</span>
						</div>
					))}
				</div>
			)}
		</>
	);
}

function StatRow({ data }: { data: FanoutData }) {
	const reconstructed = new Set(data.reconstructedModels);
	// Only models that actually produced fan-out — the tooltip describes runs that
	// "produced at least one web search", so engines that ran but exposed none (e.g.
	// OpenRouter) are left off rather than listed as 0.
	const breakdown = data.byModel.filter((m) => m.fanoutRuns > 0).sort((a, b) => b.fanoutRuns - a.fanoutRuns);
	return (
		<div className="grid gap-4 sm:grid-cols-3">
			<StatCard
				label="Search Prompt Runs"
				value={data.totalRuns.toLocaleString()}
				tip="How many times your prompts were run against engines with web search enabled."
			/>
			<StatCard
				label="Prompt Runs w/ Queries"
				value={data.fanoutRuns.toLocaleString()}
				tip={<RunsTooltip breakdown={breakdown} reconstructed={reconstructed} />}
			/>
			<StatCard
				label="Average Fanout"
				value={data.avgPerExecution.toLocaleString()}
				tip="Average queries per run that had at least one web query."
			/>
		</div>
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

// ---------------------------------------------------------------------------
// Prompt Fanout — per-prompt searches with the prompt's keywords bolded
// ---------------------------------------------------------------------------

const normTok = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Non-stop-word tokens from the prompt — these get bolded in each search. */
function promptKeywords(promptValue: string): Set<string> {
	return new Set(promptValue.split(/\s+/).map(normTok).filter((t) => t.length > 0 && !isStopword(t)));
}

function VariationLine({ query, keywords }: { query: string; keywords: Set<string> }) {
	const seen = new Map<string, number>();
	const segs = query
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => {
			const n = seen.get(w) ?? 0;
			seen.set(w, n + 1);
			return { text: w, bold: keywords.has(normTok(w)), key: `${w}:${n}` };
		});
	return (
		<div className="text-sm leading-6 break-words">
			{segs.map((s) => (
				<span key={s.key} className={s.bold ? "text-foreground font-semibold" : "text-muted-foreground"}>
					{s.text}{" "}
				</span>
			))}
		</div>
	);
}

type SortKey = "queries" | "avg";

function SortHead({ k, label, sort, setSort }: { k: SortKey; label: string; sort: SortKey; setSort: (k: SortKey) => void }) {
	return (
		<button
			type="button"
			onClick={() => setSort(k)}
			className={cn(
				"hover:text-foreground cursor-pointer uppercase tracking-wide",
				sort === k ? "text-foreground" : "",
			)}
		>
			{label}
		</button>
	);
}

const GRID = "grid grid-cols-[1.25rem_1fr_4.5rem_7rem] items-center gap-3";

function Prompts({ prompts, brandId }: { prompts: PromptFanoutStat[]; brandId: string }) {
	const [expanded, setExpanded] = useState<Set<string>>(() =>
		new Set(prompts.length === 1 ? [prompts[0].promptId] : []),
	);
	const [sort, setSort] = useState<SortKey>("queries");
	const [search, setSearch] = useState("");

	const rows = useMemo(() => {
		const s = search.trim().toLowerCase();
		const list = s ? prompts.filter((p) => p.promptValue.toLowerCase().includes(s)) : prompts;
		return [...list].sort((a, b) =>
			sort === "avg"
				? b.avgPerExecution - a.avgPerExecution || b.totalQueries - a.totalQueries
				: b.totalQueries - a.totalQueries,
		);
	}, [prompts, search, sort]);

	const toggle = (id: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<Card className="gap-4">
			<CardHeader>
				<div className="flex items-center justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-1.5 text-base">
							Prompts
							<InfoTip>
								Each prompt's fan-out: how many searches it generates (Queries) and how many per run that searched
								(Avg/Prompt Run). Expand a prompt to see the searches, with your prompt's keywords bolded.
							</InfoTip>
						</CardTitle>
						<CardDescription>The web searches each prompt triggers.</CardDescription>
					</div>
					<div className="relative w-64 shrink-0">
						<IconSearch className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search prompts..."
							className="h-8 pl-8 text-sm"
						/>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div className={cn(GRID, "text-muted-foreground/80 border-b py-2 text-[11px] font-medium")}>
					<span />
					<span className="uppercase tracking-wide">Prompt</span>
					<span className="text-right">
						<SortHead k="queries" label="Queries" sort={sort} setSort={setSort} />
					</span>
					<span className="text-right">
						<SortHead k="avg" label="Avg/Prompt Run" sort={sort} setSort={setSort} />
					</span>
				</div>
				<div className="divide-border divide-y">
					{rows.map((p) => {
						const isOpen = expanded.has(p.promptId);
						const keywords = isOpen ? promptKeywords(p.promptValue) : null;
						return (
							<div key={p.promptId} className="py-1">
								<div className={cn(GRID, "py-2")}>
									<button
										type="button"
										onClick={() => toggle(p.promptId)}
										className="text-muted-foreground hover:text-foreground cursor-pointer"
										aria-label={isOpen ? "Collapse" : "Expand"}
									>
										{isOpen ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
									</button>
									<div className="min-w-0">
										<Link
											to="/app/$brand/prompts/$promptId"
											params={{ brand: brandId, promptId: p.promptId }}
											className="block truncate text-sm font-medium hover:underline"
											title={p.promptValue}
										>
											{p.promptValue || "(untitled prompt)"}
										</Link>
										<span className="text-muted-foreground text-xs">{p.uniqueQueries.toLocaleString()} variations</span>
									</div>
									<span className="text-right text-sm tabular-nums">{p.totalQueries.toLocaleString()}</span>
									<span className="text-right text-sm tabular-nums">{p.avgPerExecution.toLocaleString()}</span>
								</div>
								{isOpen && keywords && (
									<div className="border-border mb-3 ml-8 mr-2 space-y-2 border-l pl-4">
										{p.variations.map((v) => (
											<VariationLine key={v.query} query={v.query} keywords={keywords} />
										))}
									</div>
								)}
							</div>
						);
					})}
					{rows.length === 0 && (
						<div className="text-muted-foreground py-6 text-center text-sm">No prompts match your search.</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// Query Words — the cloud + Added / Preserved / Dropped
// ---------------------------------------------------------------------------

type WordTab = "added" | "preserved" | "dropped";

const WORD_TAB_HELP: Record<WordTab, string> = {
	added: "Words engines add that weren't in your prompt — the intent they layer on (e.g. “best”, “2026”, “vs”).",
	preserved: "Words from your prompt engines keep in their searches.",
	dropped: "Words from your prompt engines leave out of their searches.",
};

function QueryWords({ data }: { data: FanoutData }) {
	const [tab, setTab] = useState<WordTab>("added");
	const [hideStop, setHideStop] = useState(true);

	const words: WordChangeStat[] = data.wordChanges[tab];
	const shown = hideStop ? words.filter((w) => !w.isStop) : words;
	const items = shown.slice(0, 18).map((w) => ({
		label: w.word,
		count: w.count,
		suffix: <span className="text-muted-foreground tabular-nums text-xs">{w.share}%</span>,
	}));

	return (
		<div className="space-y-6">
			<Card className="py-4">
				<CardContent>
					<WordCloud terms={data.terms} />
				</CardContent>
			</Card>

			<Card className="gap-3">
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<CardTitle className="flex items-center gap-1.5 text-base">
								Word Changes
								<InfoTip>{WORD_TAB_HELP[tab]}</InfoTip>
							</CardTitle>
							<CardDescription>How engines rewrite your prompt wording.</CardDescription>
						</div>
						<div className="flex items-center gap-4">
							<div className="flex items-center gap-2">
								<Switch id="qf-hide-stop" checked={hideStop} onCheckedChange={setHideStop} />
								<label htmlFor="qf-hide-stop" className="text-muted-foreground cursor-pointer text-sm">
									Hide stop words
								</label>
							</div>
							<Tabs value={tab} onValueChange={(v) => setTab(v as WordTab)}>
								<TabsList>
									<TabsTrigger value="added">Added</TabsTrigger>
									<TabsTrigger value="preserved">Preserved</TabsTrigger>
									<TabsTrigger value="dropped">Dropped</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>
					</div>
				</CardHeader>
				<Separator />
				<CardContent>
					{items.length > 0 ? (
						<ProgressBarChart items={items} defaultColor={PURPLE} />
					) : (
						<div className="text-muted-foreground py-6 text-center text-sm">
							No {tab} words{hideStop ? " (try showing stop words)" : ""}.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Query Visibility — invisible vs won
// ---------------------------------------------------------------------------

function queryItems(queries: FanoutQueryStat[]) {
	return queries.map((q) => ({ label: q.query, count: q.count }));
}

function QueryVisibility({ data }: { data: FanoutData }) {
	return (
		<div className="grid gap-6 lg:grid-cols-2">
			<Card className="gap-3">
				<CardHeader>
					<CardTitle className="flex items-center gap-1.5 text-base">
						Queries You're Invisible In
						<InfoTip>
							Queries that ran more than once where your brand did not appear. These are potential keyword opportunities.
						</InfoTip>
					</CardTitle>
					<CardDescription>Where to focus — high-volume searches you're missing.</CardDescription>
				</CardHeader>
				<Separator />
				<CardContent>
					{data.invisibleQueries.length > 0 ? (
						<ProgressBarChart items={queryItems(data.invisibleQueries)} defaultColor="#f43f5e" />
					) : (
						<div className="text-muted-foreground py-4 text-sm">
							Your brand appeared in every search that ran more than once. 🎉
						</div>
					)}
				</CardContent>
			</Card>

			<Card className="gap-3">
				<CardHeader>
					<CardTitle className="flex items-center gap-1.5 text-base">
						Queries You Win
						<InfoTip>Searches your brand shows up in more than {WON_MENTION_THRESHOLD}% of the time.</InfoTip>
					</CardTitle>
					<CardDescription>The searches you reliably show up in.</CardDescription>
				</CardHeader>
				<Separator />
				<CardContent>
					{data.wonQueries.length > 0 ? (
						<ProgressBarChart items={queryItems(data.wonQueries)} defaultColor="#10b981" />
					) : (
						<div className="text-muted-foreground py-4 text-sm">
							Your brand hasn't reliably appeared in any repeated search yet.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
