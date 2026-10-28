/**
 * "Who do the AI engines mention instead of you?" A leaderboard of competitor
 * mention rates next to the brand's own, with the brand's overall share, a
 * donut of top competitors, and share of voice over time.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { ColHead } from "@/components/col-head";
import { CompanyTrendChart } from "@/components/company-trend-chart";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { FilterSection, PageHeader } from "@/components/page-header";
import { ShareOfVoiceDonut } from "@/components/share-of-voice-donut";
import { SiteIcon } from "@/components/site-icon";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useCompetitiveLandscape, useShareOfVoice } from "@/hooks/use-share-of-voice";
import { useSiteIcons } from "@/hooks/use-site-icons";
import { useCompanyColors } from "@/lib/company-colors";
import { chartedCompanies, type Landscape } from "@/lib/landscape";
import { METRIC_META } from "@/lib/overview-metrics";
import { pageHead } from "@/lib/route-head";
import type { ShareOfVoiceEntry } from "@/server/analysis";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/share-of-voice")({
	staticData: { crumb: "Share of Voice" },
	head: pageHead({ description: "See how often AI engines mention you versus your competitors." }),
	component: ShareOfVoicePage,
});

const formatPct = (share: number) => `${Math.round(share * 100)}%`;

const TIPS = {
	mentions: "Number of runs in which this brand was mentioned in the AI answer.",
	share: "This brand's share of all brand + competitor mentions.",
	prompts: "Number of distinct prompts this brand appeared in.",
};

function ShareOfVoiceOverview({
	entries,
	landscape,
	landscapeFailed,
	colors,
	domainFor,
}: {
	entries: ShareOfVoiceEntry[];
	landscape?: Landscape;
	landscapeFailed: boolean;
	colors: Map<string, string>;
	domainFor: (name: string) => string | undefined;
}) {
	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
			<Card>
				<CardHeader>
					<CardTitle>Share of Voice</CardTitle>
				</CardHeader>
				<CardContent>
					<ShareOfVoiceDonut entries={entries} colors={colors} domainFor={domainFor} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Share of Voice Trends</CardTitle>
				</CardHeader>
				<CardContent>
					{landscape ? (
						<CompanyTrendChart
							dates={landscape.dates}
							companies={chartedCompanies(landscape, "share").map((c) => ({
								name: c.name,
								isBrand: c.isBrand,
								color: colors.get(c.name) ?? "#94a3b8",
								values: c.series.share,
							}))}
							format={METRIC_META.share.format}
							height={220}
						/>
					) : landscapeFailed ? (
						<p className="py-8 text-center text-sm text-muted-foreground">Couldn't load the trends right now.</p>
					) : (
						<Skeleton className="h-[250px] w-full" />
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function ShareOfVoicePage() {
	const brandId = useBrandId();
	const { model, lookback, tags } = useListFilters();

	const { data: brand } = useBrand(brandId);
	const { domainFor } = useSiteIcons(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;

	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const availableTags = promptsSummary?.availableTags ?? [];

	const { data, isLoading } = useShareOfVoice(brandId, { lookback, model: modelParam, tags });
	const { data: landscape, error: landscapeError } = useCompetitiveLandscape(brandId, {
		lookback,
		model: modelParam,
		tags,
	});
	const colors = useCompanyColors(landscape, data?.entries);

	const infoContent = (
		<>
			<p className="mb-2">
				Share of voice is how often each brand is mentioned in the AI answers to your prompts. Mentions are counted per
				run, so the brand and competitor figures use the same unit and are directly comparable.
			</p>
			<p>Competitors are the ones you track in settings. Switch the model filter to compare engines.</p>
		</>
	);

	const maxMentions = data?.entries.reduce((m, e) => Math.max(m, e.mentions), 0) ?? 0;

	let content: React.ReactNode;
	if (isLoading && !data) {
		content = (
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
		);
	} else if (!data || data.totalRuns === 0 || data.entries.length === 0) {
		content = (
			<Card>
				<CardContent className="pt-6">
					<div className="text-muted-foreground text-center py-8">
						No mention data yet for the selected filters. Mentions appear once your prompts have been run.
					</div>
				</CardContent>
			</Card>
		);
	} else {
		content = (
			<TooltipProvider delay={150}>
				<ShareOfVoiceOverview
					entries={data.entries}
					landscape={landscape}
					landscapeFailed={!!landscapeError && !landscape}
					colors={colors}
					domainFor={domainFor}
				/>

				<Card>
					<CardHeader>
						<CardTitle>Share of Voice Leaderboard</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10 max-sm:w-8">#</TableHead>
									<TableHead>Brand</TableHead>
									<TableHead className="text-right max-sm:hidden">
										<ColHead label="Mentions" tip={TIPS.mentions} right />
									</TableHead>
									<TableHead className="w-[34%] max-sm:w-24">
										<ColHead label="Share" tip={TIPS.share} />
									</TableHead>
									<TableHead className="text-right max-sm:hidden">
										<ColHead label="Prompts" tip={TIPS.prompts} right />
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.entries.map((e, i) => (
									<TableRow key={e.name} className={e.isBrand ? "bg-muted/40" : undefined}>
										<TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
										<TableCell className="font-medium">
											<span className="flex items-center gap-2">
												<SiteIcon domain={domainFor(e.name)} size="md" />
												{/* Capped on phones so the share bars keep their room. */}
												<span className="truncate max-sm:max-w-24">{e.name}</span>
												{e.isBrand && (
													<Badge variant="secondary" className="text-xs">
														You
													</Badge>
												)}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums max-sm:hidden">
											{e.mentions.toLocaleString()}
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<div className="bg-muted h-2 w-full overflow-hidden rounded-full max-[380px]:hidden">
													<div
														className="h-full rounded-full"
														style={{
															width: `${maxMentions > 0 ? (e.mentions / maxMentions) * 100 : 0}%`,
															backgroundColor: colors.get(e.name) ?? "#cbd5e1",
														}}
													/>
												</div>
												<span className="tabular-nums text-sm text-muted-foreground w-10 text-right">
													{formatPct(e.share)}
												</span>
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums text-muted-foreground max-sm:hidden">
											{e.prompts}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</TooltipProvider>
		);
	}

	return (
		<PageHeader
			title="Share of Voice"
			subtitle="How often AI engines mention you versus your competitors."
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar availableTags={availableTags} trackedTargets={trackedTargets} showSearch={false} showModelSelector />
			</FilterSection>
			<div className="space-y-6">{content}</div>
		</PageHeader>
	);
}
