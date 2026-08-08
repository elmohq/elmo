import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import type { CitationData } from "@/components/citations/types";
import { ProgressBarChart } from "@/components/progress-bar-chart";

const MARKETPLACE_COLOR = "#dc2626"; // red-600

export function ContentMarketplacesCard({
	domains,
}: {
	domains: CitationData["domainDistribution"];
}) {
	const stats = useMemo(() => {
		const marketplaceDomains = domains.filter((d) => d.isMarketplace);
		const totalCount = marketplaceDomains.reduce((sum, d) => sum + d.count, 0);
		const totalAcrossAllDomains = domains.reduce((sum, d) => sum + d.count, 0);
		const pct = totalAcrossAllDomains > 0 ? Math.round((totalCount / totalAcrossAllDomains) * 100) : 0;
		const uniqueMarketplaceDomains = marketplaceDomains.length;

		const topMarketplace = [...marketplaceDomains]
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return {
			marketplaceCitationCount: totalCount,
			pct,
			uniqueMarketplaceDomains,
			topMarketplace,
		};
	}, [domains]);

	if (stats.uniqueMarketplaceDomains === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					Content Marketplaces
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-sm font-normal">
							Pay-to-win link marketplaces where sites sell placements in AI-generated content. Citations from these
							domains may reflect paid placements rather than organic authority.
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					Citations from pay-to-win link marketplaces — sites that charge for links in AI-generated content
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
					<div>
						<p className="text-xs text-muted-foreground">Marketplace Citations</p>
						<p className="text-xl font-bold">{stats.marketplaceCitationCount.toLocaleString()}</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">% of All Citations</p>
						<p className="text-xl font-bold">{stats.pct}%</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Unique Marketplace Domains</p>
						<p className="text-xl font-bold">{stats.uniqueMarketplaceDomains.toLocaleString()}</p>
					</div>
				</div>
				{stats.topMarketplace.length > 0 && (
					<div>
						<p className="text-xs text-muted-foreground mb-2">Top Marketplace Domains</p>
						<ProgressBarChart
							items={stats.topMarketplace.map((d) => ({
								label: d.domain,
								count: d.count,
							}))}
							defaultColor={MARKETPLACE_COLOR}
							percentageMode="max"
							barHeight="h-1.5"
							spacing="space-y-2"
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}