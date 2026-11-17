import {
	countryName,
	languageName,
	MARKETS,
	type Market,
	marketCode,
	marketId,
	marketName,
	sameMarket,
} from "@workspace/config/markets";
import { iconIdForModelFilter, labelForModelFilter } from "@workspace/config/model-filter";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Button } from "@workspace/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { AlertTriangle, Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import {
	type MarketSupport,
	type MarketTarget,
	promptCostIn,
	targetStatusIn,
	targetsRunningIn,
} from "@/lib/market-support";

/** "4 of 6 models", or null when every tracked model answers from the country. */
export function coverageNote(support: MarketSupport, country: string): string | null {
	const running = targetsRunningIn(support, country).length;
	if (running === support.targets.length) return null;
	return `${running} of ${support.targets.length} models`;
}

/** Which tracked models run prompts asked from a country, in a sentence or two. */
export function MarketCoverage({ support, country }: { support: MarketSupport; country: string }) {
	const total = support.targets.length;
	if (total === 0) return null;
	const skipped = support.targets.filter((target) => targetStatusIn(target, country) === "skipped");
	const place = countryName(country);
	if (skipped.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				All {total} models you track run prompts asked from {place}.
			</p>
		);
	}
	if (skipped.length === total) {
		return (
			<p className="text-xs text-amber-700">
				None of the models you track can answer from {place}, so prompts asked there won&apos;t run.
			</p>
		);
	}
	return (
		<p className="text-xs text-muted-foreground">
			{total - skipped.length} of {total} models run prompts asked from {place}.{" "}
			<span className="text-amber-700">
				{skipped.map((target) => labelForModelFilter(target.value)).join(", ")} can&apos;t answer from there.
			</span>
		</p>
	);
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** To the cent below a hundred dollars, where a prompt's monthly cost usually sits. */
function formatMonthlyUsd(amount: number): string {
	return amount < 100 ? `$${amount.toFixed(2)}` : `$${Math.round(amount).toLocaleString()}`;
}

/** "6 provider calls a day, roughly $1.80 a month" */
export function describeCost(callsPerDay: number, monthlyUsd: number | null): string {
	const calls = Number.isInteger(callsPerDay) ? callsPerDay : Number(callsPerDay.toFixed(1));
	const perDay = `${plural(calls, "provider call")} a day`;
	return monthlyUsd === null ? perDay : `${perDay}, roughly ${formatMonthlyUsd(monthlyUsd)} a month`;
}

/**
 * What tracking `prompts` more prompts in a market adds, in the terms the
 * viewer pays in: provider bills when self-hosted, plan allowance in cloud.
 */
export function MarketCostNote({
	support,
	country,
	prompts = 1,
	className,
}: {
	support: MarketSupport;
	country: string;
	prompts?: number;
	className?: string;
}) {
	const cost = promptCostIn(support, country);
	const models = targetsRunningIn(support, country).length;
	const subject = prompts === 1 ? "One prompt here" : `${prompts} prompts here`;
	if (support.promptAllowance) {
		const { used, max } = support.promptAllowance;
		return (
			<p className={cn("text-xs text-muted-foreground", className)}>
				{subject} {prompts === 1 ? "uses" : "use"} {prompts} of your plan&apos;s {max} prompts ({used} in use), and{" "}
				{prompts === 1 ? "runs" : "run"} on {plural(models, "model")}.
			</p>
		);
	}
	return (
		<p className={cn("text-xs text-muted-foreground", className)}>
			{subject} {prompts === 1 ? "runs" : "run"} on {plural(models, "model")}:{" "}
			{describeCost(cost.callsPerDay * prompts, cost.monthlyUsd === null ? null : cost.monthlyUsd * prompts)}
			{cost.monthlyUsd !== null && " at estimated provider prices"}.
		</p>
	);
}

const DEFAULT_ITEM = "default";

/** cmdk matches item values in lower case. */
const itemValue = (market: Market) => marketId(market).toLowerCase();

interface MarketPickerProps {
	/** Null follows the brand's market. */
	value: Market | null;
	onChange: (market: Market | null) => void;
	support: MarketSupport;
	/** Offers "Brand Default" as the first choice. Off where the brand's own market is being picked. */
	allowDefault?: boolean;
	disabled?: boolean;
	/** Narrow enough for a table column: the market's code rather than its name. */
	compact?: boolean;
	className?: string;
}

function TriggerLabel({ value, support, compact }: Pick<MarketPickerProps, "value" | "support" | "compact">) {
	if (!value) {
		return <span className="truncate text-muted-foreground">{compact ? "Default" : "Brand Default"}</span>;
	}
	const partial = coverageNote(support, value.country) !== null;
	return (
		<>
			{partial && <AlertTriangle className="size-3.5 shrink-0 text-amber-600" aria-hidden />}
			<span className="truncate">{compact ? marketCode(value) : marketName(value)}</span>
		</>
	);
}

function describeSelection(value: Market | null, support: MarketSupport): string {
	if (!value) return `Follows the brand's market, ${marketName(support.brandMarket)}.`;
	const note = coverageNote(support, value.country);
	return note
		? `Asked in ${marketName(value)}. Only ${note} can answer from ${countryName(value.country)}.`
		: `Asked in ${marketName(value)}, whatever the brand's market is.`;
}

/**
 * One choice for country and language together. Before committing, the footer
 * says which tracked models can't answer from the highlighted market and what a
 * prompt there costs.
 */
export function MarketPicker({
	value,
	onChange,
	support,
	allowDefault = false,
	disabled,
	compact,
	className,
}: MarketPickerProps) {
	const [open, setOpen] = useState(false);
	const [highlighted, setHighlighted] = useState<string>("");
	const effective = value ?? support.brandMarket;
	const previewed =
		highlighted === DEFAULT_ITEM
			? support.brandMarket
			: (MARKETS.find((market) => itemValue(market) === highlighted) ?? effective);
	// Opens on the current choice, so the footer describes what is set before anything is hovered.
	const setOpenOnCurrent = (next: boolean) => {
		if (next) setHighlighted(value ? itemValue(value) : DEFAULT_ITEM);
		setOpen(next);
	};

	const choose = (market: Market | null) => {
		onChange(market);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpenOnCurrent}>
			<Tooltip>
				<TooltipTrigger
					render={
						<PopoverTrigger
							render={
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={disabled}
									aria-label={`Market: ${value ? marketName(value) : `brand default, ${marketName(support.brandMarket)}`}`}
									className={cn(
										"h-8 w-full justify-between gap-1 px-2 font-normal",
										value && "border-foreground/30",
										className,
									)}
								/>
							}
						/>
					}
				>
					<TriggerLabel value={value} support={support} compact={compact} />
					<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
				</TooltipTrigger>
				<TooltipContent>
					<p className="max-w-xs">{describeSelection(value, support)}</p>
				</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="w-80 p-0">
				<Command value={highlighted} onValueChange={setHighlighted}>
					<CommandInput placeholder="Search countries and languages..." />
					<CommandList className="max-h-56">
						<CommandEmpty>No market matches.</CommandEmpty>
						{allowDefault && (
							<CommandGroup>
								<CommandItem value={DEFAULT_ITEM} keywords={["brand", "default"]} onSelect={() => choose(null)}>
									<Check className={cn("size-3.5", value ? "opacity-0" : "opacity-100")} />
									<span className="flex-1">Brand Default</span>
									<span className="text-xs text-muted-foreground">{marketName(support.brandMarket)}</span>
								</CommandItem>
							</CommandGroup>
						)}
						<CommandGroup heading="Markets">
							{MARKETS.map((market) => {
								const note = coverageNote(support, market.country);
								return (
									<CommandItem
										key={marketId(market)}
										value={itemValue(market)}
										keywords={[countryName(market.country), languageName(market.language), market.country]}
										onSelect={() => choose(market)}
									>
										<Check
											className={cn("size-3.5", value && sameMarket(value, market) ? "opacity-100" : "opacity-0")}
										/>
										<span className="flex-1">{marketName(market)}</span>
										{note && <span className="text-xs text-amber-700">{note}</span>}
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
				<div className="space-y-2 border-t bg-muted/40 p-3">
					<p className="text-xs font-medium">{marketName(previewed)}</p>
					{coverageNote(support, previewed.country) && <MarketCoverage support={support} country={previewed.country} />}
					<MarketCostNote support={support} country={previewed.country} />
				</div>
			</PopoverContent>
		</Popover>
	);
}
