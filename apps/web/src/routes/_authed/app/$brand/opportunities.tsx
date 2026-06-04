/**
 * /app/$brand/opportunities - Prompt winnability
 *
 * Ranks prompts by opportunity: where competitors are mentioned but you aren't,
 * the engine grounds (so a citation is winnable), and the citation set is
 * contested. Combines grounding coverage, citation stability and presence.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Badge } from "@workspace/ui/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { usePromptOpportunities } from "@/hooks/use-prompt-opportunities";
import { useBrand } from "@/hooks/use-brands";
import { getDaysFromLookback } from "@/lib/chart-utils";
import { PageHeader, FilterSection } from "@/components/page-header";
import { FilterBar, getAvailableModels, usePageFilters } from "@/components/filter-bar";
import { OpportunityMap } from "@/components/opportunity-map";
import type { PromptOpportunity } from "@/server/analysis";

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

const TIER_CLASS: Record<PromptOpportunity["tier"], string> = {
	high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
	medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
	low: "bg-muted text-muted-foreground",
};

function GroundingBadge({ mode }: { mode: PromptOpportunity["groundingMode"] }) {
	const map = {
		grounded: { label: "Grounded", variant: "default" as const },
		mixed: { label: "Mixed", variant: "secondary" as const },
		"from-memory": { label: "From memory", variant: "outline" as const },
	};
	const { label, variant } = map[mode];
	return (
		<Badge variant={variant} className="text-xs">
			{label}
		</Badge>
	);
}

function OpportunitiesPage() {
	const { brand: brandId } = Route.useParams();
	const { selectedModel, selectedLookback } = usePageFilters();
	const days = getDaysFromLookback(selectedLookback);

	const { brand } = useBrand(brandId);
	const availableModels = getAvailableModels(brand?.effectiveModels ?? []);
	const modelParam = selectedModel === "all" ? undefined : selectedModel;

	const { data, isLoading } = usePromptOpportunities(brandId, { days, model: modelParam });

	const infoContent = (
		<>
			<p className="mb-2">
				Winnability blends four signals: how absent you are where competitors appear (the gap), whether the engine
				actually cites sources here (grounding), and how contested the citation set is (stability).
			</p>
			<p>
				<strong>Citation</strong> plays mean there is a source slot to win with content. <strong>Mention</strong>{" "}
				plays mean the engine answers from memory, so the lever is brand presence in its knowledge, not a link.
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
				<CardContent className="space-y-4">
					<Skeleton className="h-64 w-full" />
				</CardContent>
			</Card>
		);
	} else if (!data || data.prompts.length === 0) {
		content = (
			<Card>
				<CardContent className="pt-6">
					<div className="text-muted-foreground text-center py-8">
						No prompt data yet for the selected filters.
					</div>
				</CardContent>
			</Card>
		);
	} else {
		content = (
			<>
				<Card>
					<CardHeader>
						<CardTitle>Opportunity map</CardTitle>
					</CardHeader>
					<CardContent>
						<OpportunityMap prompts={data.prompts} />
						<div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
							<span className="inline-flex items-center gap-1.5">
								<span className="size-2.5 rounded-full" style={{ background: "#10b981" }} /> High winnability
							</span>
							<span className="inline-flex items-center gap-1.5">
								<span className="size-2.5 rounded-full" style={{ background: "#f59e0b" }} /> Medium
							</span>
							<span className="inline-flex items-center gap-1.5">
								<span className="size-2.5 rounded-full" style={{ background: "#94a3b8" }} /> Low
							</span>
							<span>Dots below the dashed parity line are prompts where competitors lead and you trail.</span>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Prompts by winnability</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Prompt</TableHead>
									<TableHead>Winnability</TableHead>
									<TableHead className="text-right">You</TableHead>
									<TableHead className="text-right">Competitors</TableHead>
									<TableHead>Grounding</TableHead>
									<TableHead className="text-right">Stability</TableHead>
									<TableHead>Play</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.prompts.map((p) => (
									<TableRow key={p.promptId}>
										<TableCell className="max-w-[320px]">
											<span className="line-clamp-2" title={p.prompt}>
												{p.prompt}
											</span>
										</TableCell>
										<TableCell>
											<span
												className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TIER_CLASS[p.tier]}`}
											>
												{p.tier}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums">{pct(p.brandMentionRate)}</TableCell>
										<TableCell className="text-right tabular-nums">{pct(p.competitorMentionRate)}</TableCell>
										<TableCell>
											<GroundingBadge mode={p.groundingMode} />
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{p.stabilityScore === null ? "—" : p.stabilityScore}
										</TableCell>
										<TableCell className="capitalize text-muted-foreground">{p.play}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</>
		);
	}

	return (
		<PageHeader
			title="Opportunities"
			subtitle="Where you can win AI citations: contested prompts where competitors lead and you trail."
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar availableTags={[]} availableModels={availableModels} showSearch={false} showModelSelector />
			</FilterSection>
			<div className="space-y-6">{content}</div>
		</PageHeader>
	);
}
