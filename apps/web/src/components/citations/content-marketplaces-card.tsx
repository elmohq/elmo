import { IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useMemo } from "react";
import type { CitationData } from "@/components/citations/types";
import { ProgressBarChart } from "@/components/progress-bar-chart";

const MARKETPLACE_COLOR = "#dc2626"; // red-600
const TOP_DOMAINS_SHOWN = 10;

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="text-xl font-bold">{value}</p>
		</div>
	);
}

export function ContentMarketplacesCard({ domains }: { domains: CitationData["domainDistribution"] }) {
	const marketplaces = useMemo(
		() => domains.filter((d) => d.isMarketplace).sort((a, b) => b.count - a.count),
		[domains],
	);

	if (marketplaces.length === 0) return null;

	const citations = marketplaces.reduce((sum, d) => sum + d.count, 0);
	const allCitations = domains.reduce((sum, d) => sum + d.count, 0);
	const share = allCitations > 0 ? Math.round((citations / allCitations) * 100) : 0;

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
					<Stat label="Marketplace Citations" value={citations.toLocaleString()} />
					<Stat label="% of All Citations" value={`${share}%`} />
					<Stat label="Unique Marketplace Domains" value={marketplaces.length.toLocaleString()} />
				</div>
				<p className="text-xs text-muted-foreground mb-2">Top Marketplace Domains</p>
				<ProgressBarChart
					items={marketplaces.slice(0, TOP_DOMAINS_SHOWN).map((d) => ({ label: d.domain, count: d.count }))}
					defaultColor={MARKETPLACE_COLOR}
					percentageMode="max"
					barHeight="h-1.5"
					spacing="space-y-2"
				/>
			</CardContent>
		</Card>
	);
}
