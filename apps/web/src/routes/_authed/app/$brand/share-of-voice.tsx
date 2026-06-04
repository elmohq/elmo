/**
 * /app/$brand/share-of-voice - Share of Voice
 *
 * "Who do the AI engines mention instead of you?" A leaderboard of competitor
 * mention rates next to the brand's own, derived from prompt_runs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Badge } from "@workspace/ui/components/badge";
import { Progress } from "@workspace/ui/components/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import { useBrand } from "@/hooks/use-brands";
import { getDaysFromLookback } from "@/lib/chart-utils";
import { PageHeader, FilterSection } from "@/components/page-header";
import { FilterBar, getAvailableModels, usePageFilters } from "@/components/filter-bar";

export const Route = createFileRoute("/_authed/app/$brand/share-of-voice")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Share of Voice", { appName, brandName }) },
				{ name: "description", content: "See how often AI engines mention you versus your competitors." },
			],
		};
	},
	component: ShareOfVoicePage,
});

const formatPct = (share: number) => `${Math.round(share * 100)}%`;

function ShareOfVoicePage() {
	const { brand: brandId } = Route.useParams();
	const { selectedModel, selectedLookback } = usePageFilters();
	const days = getDaysFromLookback(selectedLookback);

	const { brand } = useBrand(brandId);
	const availableModels = getAvailableModels(brand?.effectiveModels ?? []);
	const modelParam = selectedModel === "all" ? undefined : selectedModel;

	const { data, isLoading } = useShareOfVoice(brandId, { days, model: modelParam });

	const infoContent = (
		<>
			<p className="mb-2">
				Share of voice is how often each brand is mentioned in the AI answers to your prompts. Mentions are counted
				per run, so the brand and competitor figures use the same unit and are directly comparable.
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
			<>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-medium text-muted-foreground">Your share of voice</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl sm:text-4xl font-bold">
							{data.brandShare !== null ? formatPct(data.brandShare) : "—"}
						</div>
						<p className="text-sm text-muted-foreground mt-1">
							{data.brandName} across {data.totalRuns.toLocaleString()} runs
							{data.entries.length > 1 ? ` and ${data.entries.length - 1} competitors` : ""}.
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Mention leaderboard</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10">#</TableHead>
									<TableHead>Brand</TableHead>
									<TableHead className="text-right">Mentions</TableHead>
									<TableHead className="w-[34%]">Share</TableHead>
									<TableHead className="text-right">Prompts</TableHead>
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
														You
													</Badge>
												)}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums">{e.mentions.toLocaleString()}</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<Progress
													value={maxMentions > 0 ? (e.mentions / maxMentions) * 100 : 0}
													className="h-2"
												/>
												<span className="tabular-nums text-sm text-muted-foreground w-10 text-right">
													{formatPct(e.share)}
												</span>
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums text-muted-foreground">
											{e.prompts ?? "—"}
										</TableCell>
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
			title="Share of Voice"
			subtitle="How often AI engines mention you versus your competitors."
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar availableTags={[]} availableModels={availableModels} showSearch={false} showModelSelector />
			</FilterSection>
			<div className="space-y-6">{content}</div>
		</PageHeader>
	);
}
