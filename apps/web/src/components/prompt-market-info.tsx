import { type Market, marketName } from "@workspace/config/markets";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { AlertTriangle, Globe } from "lucide-react";
import { FilterTriggerButton } from "@/components/filter-bar";
import { coverageNote, MarketCostNote, MarketSupportList } from "@/components/market-picker";
import type { MarketSupport } from "@/lib/market-support";

/** The market a prompt is asked in; opened, how each tracked model runs the prompt there. */
export function PromptMarketInfo({
	market,
	overridden,
	support,
}: {
	market: Market;
	/** False when the prompt follows the brand's market. */
	overridden: boolean;
	support: MarketSupport | undefined;
}) {
	if (!support) return null;

	const partial = coverageNote(support, market.country);
	return (
		<Popover>
			<PopoverTrigger
				render={
					<FilterTriggerButton
						icon={partial ? <AlertTriangle className="size-3.5 text-amber-600" /> : <Globe className="size-3.5" />}
						label={marketName(market)}
						aria-label={`Market: ${marketName(market)}`}
					/>
				}
			/>
			<PopoverContent align="end" className="w-80 space-y-2">
				<div>
					<p className="text-xs font-medium">How Each Model Runs This Prompt</p>
					<p className="text-xs text-muted-foreground">
						{overridden ? "This market is set on the prompt." : "This prompt follows the brand's market."}
						{partial && ` Only ${partial} can answer from here.`}
					</p>
				</div>
				<MarketSupportList support={support} market={market} />
				<MarketCostNote support={support} country={market.country} />
			</PopoverContent>
		</Popover>
	);
}
