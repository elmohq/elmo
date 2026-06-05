/**
 * /app/$brand/opportunities - Prompt opportunities
 *
 * Ranks competitive (non-branded) prompts by opportunity: where competitors are
 * mentioned but you aren't. A prompt is only winnable if brands are mentioned at
 * all — prompts where neither you nor competitors show up aren't brand queries,
 * so they're listed separately. Citation stability is shown alongside (its own
 * chart + a column) but doesn't drive the opportunity score.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { ColHead } from "@/components/col-head";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { usePromptOpportunities } from "@/hooks/use-prompt-opportunities";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBrand } from "@/hooks/use-brands";
import { PageHeader, FilterSection } from "@/components/page-header";
import { FilterBar, getAvailableModels, usePageFilters } from "@/components/filter-bar";
import { OpportunityMap } from "@/components/opportunity-map";
import { OpportunityStabilityChart } from "@/components/opportunity-stability-chart";
import type { OpportunityTier } from "@/lib/visibility-stats";

export const Route = createFileRoute("/_authed/app/$brand/opportunities")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Opportunities", { appName, brandName }) },
				{ name: "description", content: "Find the prompts where you can win AI mentions and citations." },
			],
		};
	},
	component: OpportunitiesPage,
});

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

const TIER_CLASS: Record<OpportunityTier, string> = {
	won: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
	high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
	medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
	low: "bg-muted text-muted-foreground",
	none: "bg-muted text-muted-foreground",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
	return (
		<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
			{children}
		</span>
	);
}

const TIPS = {
	opportunity:
		"How big the opening is — the gap by which competitors out-mention you. 'Won' means you're mentioned at least as often as competitors.",
	you: "How often AI mentions your brand in answers to this prompt.",
	competitors: "How often AI mentions any tracked competitor.",
	stability:
		"0–100: how stable the cited sources are day to day (100 = the same sources every day; low = churning). Higher means a citation you earn tends to stick.",
};

function OpportunitiesPage() {
	const { brand: brandId } = Route.useParams();
	const { selectedModel, selectedLookback, selectedTags } = usePageFilters();

	const { brand } = useBrand(brandId);
	const availableModels = getAvailableModels(brand?.effectiveModels ?? []);
	const modelParam = selectedModel === "all" ? undefined : selectedModel;

	const { promptsSummary } = usePromptsSummary(brandId, { lookback: selectedLookback, model: modelParam });
	const availableTags = promptsSummary?.availableTags ?? [];

	const { data, isLoading } = usePromptOpportunities(brandId, { lookback: selectedLookback, model: modelParam, tags: selectedTags });

	// "none" = neither you nor competitors are mentioned enough to be a brand query.
	const opportunities = data?.prompts.filter((p) => p.tier !== "none") ?? [];
	const noBrandMentions = data?.prompts.filter((p) => p.tier === "none") ?? [];

	const infoContent = (
		<>
			<p className="mb-2">
				A prompt is only winnable if brands actually get mentioned in the answer. Opportunity is the gap by which
				competitors out-mention you — biggest where competitors lead and you're absent. Your own branded prompts are
				excluded.
			</p>
			<p>
				Prompts where neither you nor competitors are mentioned aren't brand-recommendation queries, so they're listed
				separately below. Citation stability is shown alongside but doesn't change the opportunity ranking.
			</p>
		</>
	);

	let content: React.ReactNode;
	if (isLoading && !data) {
		content = (
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-48" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-64 w-full" />
				</CardContent>
			</Card>
		);
	} else if (!data || data.prompts.length === 0) {
		content = (
			<Card>
				<CardContent className="pt-6">
					<div className="text-muted-foreground text-center py-8">No prompt data yet for the selected filters.</div>
				</CardContent>
			</Card>
		);
	} else {
		content = (
			<TooltipProvider delayDuration={150}>
				<Card>
					<CardHeader>
						<CardTitle>Opportunity Map</CardTitle>
						<CardDescription>
							Dots below the dashed parity line are prompts where competitors lead and you trail. Branded prompts and
							prompts with no brand mentions are excluded.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<OpportunityMap prompts={opportunities} />
						<div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
							<LegendDot color="#3b82f6" label="Won" />
							<LegendDot color="#10b981" label="High" />
							<LegendDot color="#f59e0b" label="Medium" />
							<LegendDot color="#94a3b8" label="Low" />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Opportunity vs Citation Stability</CardTitle>
						<CardDescription>
							Each open prompt placed by how big the opening is (up) and how steady its cited sources are
							(right). Top-right is the sweet spot — a sizeable gap whose sources hold, so a citation you earn
							there tends to stick; sources to the left churn day to day. Won prompts are omitted.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<OpportunityStabilityChart prompts={opportunities} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Opportunities</CardTitle>
						<CardDescription>
							Ranked by the competitor-vs-you gap. "Won" prompts are ones you already lead.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{opportunities.length === 0 ? (
							<div className="text-muted-foreground text-sm py-4">No competitive prompts for the selected filters.</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Prompt</TableHead>
										<TableHead>
											<ColHead label="Opportunity" tip={TIPS.opportunity} />
										</TableHead>
										<TableHead className="text-right">
											<ColHead label="You" tip={TIPS.you} right />
										</TableHead>
										<TableHead className="text-right">
											<ColHead label="Competitors" tip={TIPS.competitors} right />
										</TableHead>
										<TableHead className="text-right">
											<ColHead label="Stability" tip={TIPS.stability} right />
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{opportunities.map((p) => (
										<TableRow key={p.promptId}>
											<PromptCell prompt={p.prompt} />
											<TableCell>
												<Pill className={`capitalize ${TIER_CLASS[p.tier]}`}>{p.tier}</Pill>
											</TableCell>
											<TableCell className="text-right tabular-nums">{pct(p.brandMentionRate)}</TableCell>
											<TableCell className="text-right tabular-nums">{pct(p.competitorMentionRate)}</TableCell>
											<TableCell className="text-right tabular-nums">
												{p.stabilityScore === null ? (
													<span title="Not enough citation history yet">—</span>
												) : (
													p.stabilityScore
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>

				{noBrandMentions.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>Few Brand Mentions</CardTitle>
							<CardDescription>
								You and your competitors are each named in 10% or fewer of these answers — they read more like
								informational questions than brand-recommendation queries, so there's little to win until that shifts.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Prompt</TableHead>
										<TableHead className="text-right">
											<ColHead label="You" tip={TIPS.you} right />
										</TableHead>
										<TableHead className="text-right">
											<ColHead label="Competitors" tip={TIPS.competitors} right />
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{noBrandMentions.map((p) => (
										<TableRow key={p.promptId}>
											<PromptCell prompt={p.prompt} />
											<TableCell className="text-right tabular-nums">{pct(p.brandMentionRate)}</TableCell>
											<TableCell className="text-right tabular-nums">{pct(p.competitorMentionRate)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				)}
			</TooltipProvider>
		);
	}

	return (
		<PageHeader
			title="Opportunities"
			subtitle="Where you can win AI mentions: prompts where competitors lead and you trail."
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar availableTags={availableTags} availableModels={availableModels} showSearch={false} showModelSelector />
			</FilterSection>
			<div className="space-y-6">{content}</div>
		</PageHeader>
	);
}

function PromptCell({ prompt }: { prompt: string }) {
	return (
		<TableCell className="max-w-[320px]">
			<span className="line-clamp-2" title={prompt}>
				{prompt}
			</span>
		</TableCell>
	);
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="size-2.5 rounded-full" style={{ background: color }} /> {label}
		</span>
	);
}
