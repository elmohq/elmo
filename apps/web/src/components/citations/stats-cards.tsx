import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { formatNumber, formatPercent } from "@/i18n/formatting";
import * as m from "@/paraglide/messages.js";

function StatCard({ title, tooltip, value }: { title: string; tooltip: React.ReactNode; value: React.ReactNode }) {
	return (
		<Card className="flex flex-col">
			<CardHeader className="gap-0">
				<CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
					{title}
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-sm font-normal">{tooltip}</TooltipContent>
					</Tooltip>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex-1 flex items-center">
				<div className="text-2xl sm:text-3xl lg:text-4xl font-bold">{value}</div>
			</CardContent>
		</Card>
	);
}

export function CitationStatsCards({
	brandShare,
	uniqueDomains,
	totalCitations,
}: {
	brandShare: number;
	uniqueDomains: number;
	totalCitations: number;
}) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<StatCard
				title={m.citations_brand_share()}
				tooltip={m.citations_brand_share_tip()}
				value={formatPercent(brandShare / 100)}
			/>
			<StatCard
				title={m.citations_unique_domains()}
				tooltip={m.citations_unique_domains_tip()}
				value={formatNumber(uniqueDomains)}
			/>
			{/* Kept deliberately simple: the user doesn't need the Google AI Mode
			    search/shopping nuance. Those surfaces aren't citations in the
			    traditional sense (they point back into Google's own product/search
			    results, not an external domain w.r.t. the model), so they're
			    excluded from this count and broken out in the Google Shopping card. */}
			<StatCard
				title={m.citations_total()}
				tooltip={m.citations_total_tip()}
				value={formatNumber(totalCitations)}
			/>
		</div>
	);
}
