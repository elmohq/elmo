/**
 * /app/$brand/opportunities - Prompt opportunities
 *
 * Ranks competitive (non-branded) prompts by opportunity: where competitors are
 * mentioned but you aren't, the engine grounds (so a citation is winnable), and
 * the citation set is contested. Prompts the engine answers from memory are
 * listed separately — there is no citation to win there.
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
import { getDaysFromLookback } from "@/lib/chart-utils";
import { PageHeader, FilterSection } from "@/components/page-header";
import { FilterBar, getAvailableModels, usePageFilters } from "@/components/filter-bar";
import { OpportunityMap } from "@/components/opportunity-map";
import type { GroundingFrequency, OpportunityTier } from "@/lib/visibility-stats";

export const Route = createFileRoute("/_authed/app/$brand/opportunities")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Opportunities", { appName, brandName }) },
				{ name: "description", content: "Find the prompts where you can win AI citations." },
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
};

const GROUNDING: Record<GroundingFrequency, { label: string; className: string }> = {
	always: { label: "Always", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
	usually: { label: "Usually", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
	sometimes: { label: "Sometimes", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
	rarely: { label: "Rarely", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
	never: { label: "Never", className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
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
		"How big the opening is — blends the competitor gap, whether the engine cites here, and how contested the citations are. 'Won' means you already lead.",
	you: "How often AI mentions your brand in answers to this prompt.",
	competitors: "How often AI mentions any tracked competitor.",
	grounding: "How often the engine cites sources for this prompt versus answering from its own knowledge.",
	stability:
		"0–100: how stable the cited sources are day to day (100 = the same sources every day; low = churning). Higher means a citation you earn tends to stick.",
};

function OpportunitiesPage() {
	const { brand: brandId } = Route.useParams();
	const { selectedModel, selectedLookback, selectedTags } = usePageFilters();
	const days = getDaysFromLookback(selectedLookback);

	const { brand } = useBrand(brandId);
	const availableModels = getAvailableModels(brand?.effectiveModels ?? []);
	const modelParam = selectedModel === "all" ? undefined : selectedModel;

	const { promptsSummary } = usePromptsSummary(brandId, { lookback: selectedLookback, model: modelParam });
	const availableTags = promptsSummary?.availableTags ?? [];

	const { data, isLoading } = usePromptOpportunities(brandId, { days, model: modelParam, tags: selectedTags });

	const opportunities = data?.prompts.filter((p) => p.isCitationOpportunity) ?? [];
	const fromMemory = data?.prompts.filter((p) => !p.isCitationOpportunity) ?? [];

	const infoContent = (
		<>
			<p className="mb-2">
				Opportunity blends three signals: how absent you are where competitors appear (the gap), whether the engine
				actually cites sources here (grounding), and how contested the citation set is (stability). Your own branded
				prompts are excluded.
			</p>
			<p>
				Prompts the engine answers from memory have no citation to win, so they are listed separately below — focus
				on brand presence there, not links.
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
							Dots below the dashed parity line are prompts where competitors lead and you trail.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<OpportunityMap prompts={data.prompts} />
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
						<CardTitle>Opportunities</CardTitle>
						<CardDescription>
							Prompts the engine cites for, ranked by opportunity. "Won" prompts are ones you already lead.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{opportunities.length === 0 ? (
							<div className="text-muted-foreground text-sm py-4">
								No grounded prompts for the selected filters.
							</div>
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
										<TableHead>
											<ColHead label="Grounding" tip={TIPS.grounding} />
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
											<TableCell>
												<Pill className={GROUNDING[p.groundingFrequency].className}>
													{GROUNDING[p.groundingFrequency].label}
												</Pill>
											</TableCell>
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

				{fromMemory.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>Answered from memory</CardTitle>
							<CardDescription>
								For these prompts the engine rarely or never cites a source, so there is no citation to win. The
								lever here is brand presence in the model's knowledge, not a link.
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
										<TableHead>
											<ColHead label="Grounding" tip={TIPS.grounding} />
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{fromMemory.map((p) => (
										<TableRow key={p.promptId}>
											<PromptCell prompt={p.prompt} />
											<TableCell className="text-right tabular-nums">{pct(p.brandMentionRate)}</TableCell>
											<TableCell className="text-right tabular-nums">{pct(p.competitorMentionRate)}</TableCell>
											<TableCell>
												<Pill className={GROUNDING[p.groundingFrequency].className}>
													{GROUNDING[p.groundingFrequency].label}
												</Pill>
											</TableCell>
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
			subtitle="Where you can win AI citations: contested prompts where competitors lead and you trail."
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
