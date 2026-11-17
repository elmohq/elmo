import { type Market, marketName } from "@workspace/config/markets";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { AlertTriangle, Globe } from "lucide-react";
import { FilterTriggerButton } from "@/components/filter-bar";
import { coverageNote, MarketCoverage } from "@/components/market-picker";
import type { MarketSupport } from "@/lib/market-support";

/** The market a prompt is asked in; opened, whose setting it is and which tracked models run it there. */
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

	const partial = coverageNote(support, market.country) !== null;
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
			<PopoverContent align="end" className="w-72 space-y-1.5">
				<p className="text-xs font-medium">{overridden ? "Set on This Prompt" : "Brand Default Market"}</p>
				<MarketCoverage support={support} country={market.country} />
			</PopoverContent>
		</Popover>
	);
}
