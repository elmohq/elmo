import { type Market, marketName } from "@workspace/config/markets";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ChevronDown } from "lucide-react";
import { coverageNote, MarketCostNote, MarketSupportList } from "@/components/market-picker";
import type { MarketSupport } from "@/lib/market-support";

export function PromptMarketInfo({
	market,
	overridden,
	support,
}: {
	market: Market;
	overridden: boolean;
	support: MarketSupport | undefined;
}) {
	const label = (
		<>
			<span className="text-muted-foreground">Market:</span> {marketName(market)}
			<span className="text-muted-foreground"> ({overridden ? "set on this prompt" : "brand default"})</span>
		</>
	);
	if (!support) return <span>{label}</span>;

	const note = coverageNote(support, market.country);
	return (
		<Popover>
			<PopoverTrigger className="inline-flex cursor-pointer items-center gap-1 text-left">
				<span>{label}</span>
				{note && <span className="text-amber-700">· {note}</span>}
				<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 space-y-2">
				<p className="text-xs font-medium">How Each Model Runs This Prompt</p>
				<MarketSupportList support={support} market={market} />
				<MarketCostNote support={support} country={market.country} />
			</PopoverContent>
		</Popover>
	);
}
