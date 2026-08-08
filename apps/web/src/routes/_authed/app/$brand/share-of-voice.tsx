/**
 * /app/$brand/share-of-voice - Share of Voice
 *
 * "Who do the AI engines mention instead of you?" A leaderboard of competitor
 * mention rates next to the brand's own, with the brand's overall share, a
 * donut of top competitors, and share of voice over time.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Badge } from "@workspace/ui/components/badge";
import { shareOfVoiceColorMap } from "@/lib/share-of-voice-palette";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBrand } from "@/hooks/use-brands";
import { PageHeader, FilterSection } from "@/components/page-header";
import { FilterBar, getAvailableModels, ALL_MODELS_VALUE } from "@/components/filter-bar";
import { useListFilters } from "@/hooks/use-list-filters";
import { ColHead } from "@/components/col-head";
import { ShareOfVoiceDonut } from "@/components/share-of-voice-donut";
import { TrendChart } from "@/components/trend-chart";
import { formatNumber, formatPercent } from "@/i18n/formatting";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/_authed/app/$brand/share-of-voice")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle(m.page_share_title(), { appName, brandName }) },
				{ name: "description", content: m.page_share_description() },
			],
		};
	},
	component: ShareOfVoicePage,
});

const formatPct = (share: number) => formatPercent(share, { maximumFractionDigits: 0 });

/** Latest non-null point of the share-of-voice trend — the value the line ends on. */
function currentShareOf(series: Array<{ share: number | null }>): number | null {
	for (let i = series.length - 1; i >= 0; i--) {
		const v = series[i]?.share;
		if (typeof v === "number") return v;
	}
	return null;
}

const TIPS = {
	mentions: m.share_mentions_tip,
	share: m.share_share_tip,
	prompts: m.share_prompts_tip,
};

function ShareOfVoicePage() {
	const { brand: brandId } = Route.useParams();
	const { model, lookback, tags } = useListFilters();

	const { brand } = useBrand(brandId);
	const availableModels = getAvailableModels(brand?.effectiveModels ?? []);
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;

	const { promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const availableTags = promptsSummary?.availableTags ?? [];

	const { data, isLoading } = useShareOfVoice(brandId, { lookback, model: modelParam, tags });

	const infoContent = (
		<>
			<p className="mb-2">{m.page_share_info()}</p>
			<p>{m.page_share_info_filters()}</p>
		</>
	);

	const maxMentions = data?.entries.reduce((m, e) => Math.max(m, e.mentions), 0) ?? 0;
	const barColors = shareOfVoiceColorMap(data?.entries ?? []);

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
						{m.page_share_empty()}
					</div>
				</CardContent>
			</Card>
		);
	} else {
		// The big number = the trend's last plotted point, so it matches the line beside it.
		const currentShare = currentShareOf(data.shareTimeSeries);
		content = (
			<TooltipProvider delayDuration={150}>
				<div className="grid gap-6 lg:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>{m.page_share_title()}</CardTitle>
						</CardHeader>
						<CardContent className="flex items-center justify-between gap-4">
							<div>
								<div className="text-3xl sm:text-4xl font-bold tabular-nums">
									{currentShare !== null
										? formatPercent(currentShare / 100, { maximumFractionDigits: 0 })
										: "—"}
								</div>
								<p className="text-sm text-muted-foreground mt-1 max-w-[18rem]">
									{data.entries.length > 1
										? m.share_summary_competitors({
												brandName: data.brandName,
												runs: formatNumber(data.totalRuns),
												competitors: formatNumber(data.entries.length - 1),
											})
										: m.share_summary({ brandName: data.brandName, runs: formatNumber(data.totalRuns) })}
								</p>
							</div>
							<ShareOfVoiceDonut entries={data.entries} />
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{m.share_trends()}</CardTitle>
						</CardHeader>
						<CardContent>
							<TrendChart
								data={data.shareTimeSeries.map((p) => ({ date: p.date, value: p.share }))}
								label={m.page_share_title()}
								color="#2563eb"
								className="aspect-auto h-[180px] w-full"
							/>
						</CardContent>
					</Card>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>{m.share_leaderboard()}</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10">#</TableHead>
									<TableHead>{m.share_brand()}</TableHead>
									<TableHead className="text-right">
										<ColHead label={m.share_mentions()} tip={TIPS.mentions()} right />
									</TableHead>
									<TableHead className="w-[34%]">
										<ColHead label={m.share_share()} tip={TIPS.share()} />
									</TableHead>
									<TableHead className="text-right">
										<ColHead label={m.share_prompts()} tip={TIPS.prompts()} right />
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.entries.map((e, i) => (
									<TableRow key={e.name} className={e.isBrand ? "bg-muted/40" : undefined}>
										<TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
										<TableCell className="font-medium">
											<span className="inline-flex items-center gap-2">
												{e.name}
												{e.isBrand && (
													<Badge variant="secondary" className="text-xs">
												{m.share_you()}
													</Badge>
												)}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums">{formatNumber(e.mentions)}</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<div className="bg-muted h-2 w-full overflow-hidden rounded-full">
													<div
														className="h-full rounded-full"
														style={{
															width: `${maxMentions > 0 ? (e.mentions / maxMentions) * 100 : 0}%`,
															backgroundColor: barColors.get(e.name) ?? "#cbd5e1",
														}}
													/>
												</div>
												<span className="tabular-nums text-sm text-muted-foreground w-10 text-right">
													{formatPct(e.share)}
												</span>
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums text-muted-foreground">
											{formatNumber(e.prompts)}
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
			title={m.page_share_title()}
			subtitle={m.page_share_description()}
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar
					availableTags={availableTags}
					availableModels={availableModels}
					showSearch={false}
					showModelSelector
				/>
			</FilterSection>
			<div className="space-y-6">{content}</div>
		</PageHeader>
	);
}
