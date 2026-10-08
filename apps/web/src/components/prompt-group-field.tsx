import { COUNTRIES, countryName, DEFAULT_COUNTRY } from "@workspace/config/countries";
import { DEFAULT_LANGUAGE, languageName } from "@workspace/config/languages";
import { Button } from "@workspace/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Layers } from "lucide-react";
import { useState } from "react";
import { CountrySelect, LanguageSelect } from "@/components/market-select";
import { marketLabel } from "@/lib/prompt-markets";

export interface Market {
	country: string;
	language: string;
}

export interface GroupSummary {
	groupId: string;
	/** The first member's text, which is how the group reads everywhere. */
	label: string;
	markets: Market[];
}

/** The default market if the group doesn't have it yet, else the first country it lacks in that language. */
function firstOpenMarket(taken: Market[], preferred?: Market): Market {
	const language = preferred?.language ?? DEFAULT_LANGUAGE;
	const has = (country: string) => taken.some((m) => m.country === country && m.language === language);
	const country = [preferred?.country ?? DEFAULT_COUNTRY, ...COUNTRIES.map((c) => c.code)].find((c) => !has(c));
	return { country: country ?? DEFAULT_COUNTRY, language };
}

/** Where a prompt is asked from and in what language, fixed once it's saved. */
export function MarketField({
	market,
	saved,
	onChange,
}: {
	market: Market;
	saved: boolean;
	onChange: (market: Market) => void;
}) {
	if (saved) {
		return (
			<div
				className="flex h-9 items-center px-1 text-sm"
				title="Fixed once saved. Add a variant to track this prompt in another country or language."
			>
				<span className="truncate">
					{countryName(market.country)} · {languageName(market.language)}
				</span>
			</div>
		);
	}
	return (
		<div className="flex gap-1">
			<CountrySelect
				value={market.country}
				onChange={(country) => onChange({ ...market, country })}
				className="h-9 min-w-0 flex-1"
			/>
			<LanguageSelect
				value={market.language}
				onChange={(language) => onChange({ ...market, language })}
				className="h-9 w-24 shrink-0"
			/>
		</div>
	);
}

/**
 * A prompt's group: the other countries and languages it's asked in. Adds a
 * variant, or moves the prompt into another group (or out on its own).
 */
export function PromptGroupField({
	group,
	otherGroups,
	defaultMarket,
	onAddVariant,
	onMove,
	onSeparate,
}: {
	group: GroupSummary;
	otherGroups: GroupSummary[];
	defaultMarket?: Market;
	onAddVariant: (market: Market) => void;
	onMove: (groupId: string) => void;
	onSeparate: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [market, setMarket] = useState<Market>(() => firstOpenMarket(group.markets, defaultMarket));
	const variants = group.markets.length;
	const taken = group.markets.some((m) => m.country === market.country && m.language === market.language);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 w-full justify-center gap-1 px-2"
						aria-label={`Group: ${variants} variant${variants === 1 ? "" : "s"}`}
					/>
				}
			>
				<Layers className="size-3.5 text-muted-foreground" />
				<span className="text-xs tabular-nums">{variants}</span>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 space-y-3 p-3">
				<div className="space-y-1">
					<p className="text-sm font-medium">Variants</p>
					<p className="text-xs text-muted-foreground">
						The same question asked in other countries or languages. They're shown and compared together.
					</p>
					<div className="flex flex-wrap gap-1 pt-1">
						{group.markets.map((m) => (
							<span key={marketLabel(m)} className="rounded border px-1.5 py-0.5 font-mono text-[10px]">
								{marketLabel(m)}
							</span>
						))}
					</div>
				</div>

				<div className="space-y-1.5 border-t pt-3">
					<p className="text-sm font-medium">Add a variant</p>
					<MarketField market={market} saved={false} onChange={setMarket} />
					<Button
						type="button"
						size="sm"
						className="w-full"
						disabled={taken}
						onClick={() => {
							onAddVariant(market);
							setOpen(false);
						}}
					>
						{taken ? "Already in this group" : "Add variant"}
					</Button>
					<p className="text-xs text-muted-foreground">Starts with this prompt's text; translate it before saving.</p>
				</div>

				{(otherGroups.length > 0 || variants > 1) && (
					<div className="space-y-1 border-t pt-3">
						<p className="text-sm font-medium">Move to</p>
						<div className="max-h-48 overflow-y-auto">
							{variants > 1 && (
								<button
									type="button"
									onClick={() => {
										onSeparate();
										setOpen(false);
									}}
									className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
								>
									Its own group
								</button>
							)}
							{otherGroups.map((other) => (
								<button
									type="button"
									key={other.groupId}
									onClick={() => {
										onMove(other.groupId);
										setOpen(false);
									}}
									className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
								>
									<span className="min-w-0 flex-1 truncate">{other.label || "Untitled"}</span>
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
										{other.markets.map(marketLabel).join(", ")}
									</span>
								</button>
							))}
						</div>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
