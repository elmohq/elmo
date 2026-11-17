import { countryName, languageName, type Market } from "@workspace/config/markets";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { AlertTriangle, Globe } from "lucide-react";
import { CountryCoverage, coverageNote } from "@/components/country-picker";
import { FilterTriggerButton } from "@/components/filter-bar";
import type { MarketSupport } from "@/lib/market-support";

/** The country a prompt is asked from; opened, whose setting it is, its language, and which tracked models run it there. */
export function PromptCountryInfo({
	market,
	overridden,
	support,
}: {
	market: Market;
	/** False when the prompt follows the brand's country. */
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
						label={countryName(market.country)}
						aria-label={`Country: ${countryName(market.country)}`}
					/>
				}
			/>
			<PopoverContent align="end" className="w-72 space-y-1.5">
				<p className="text-xs font-medium">{overridden ? "Set on This Prompt" : "Brand Default"}</p>
				<p className="text-xs text-muted-foreground">Written in {languageName(market.language)}.</p>
				<CountryCoverage support={support} country={market.country} />
			</PopoverContent>
		</Popover>
	);
}
