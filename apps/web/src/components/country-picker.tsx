import { COUNTRIES, countryName } from "@workspace/config/markets";
import { labelForModelFilter } from "@workspace/config/model-filter";
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
import { type MarketSupport, promptCostIn, targetStatusIn, targetsRunningIn } from "@/lib/market-support";

/** "4 of 6 models", or null when every tracked model answers from the country. */
export function coverageNote(support: MarketSupport, country: string): string | null {
	const running = targetsRunningIn(support, country).length;
	if (running === support.targets.length) return null;
	return `${running} of ${support.targets.length} models`;
}

export function CountryCoverage({ support, country }: { support: MarketSupport; country: string }) {
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
 * What tracking `prompts` more prompts from a country adds, in the terms the
 * viewer pays in: provider bills when self-hosted, plan allowance in cloud.
 */
export function CountryCostNote({
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
const itemValue = (country: string) => country.toLowerCase();

interface CountryPickerProps {
	/** Null follows the brand's country. */
	country: string | null;
	onCountryChange: (country: string | null) => void;
	support: MarketSupport;
	/** Offers "Brand Default" as the first choice. Off where the brand's own country is being picked. */
	allowDefault?: boolean;
	disabled?: boolean;
	className?: string;
}

function TriggerLabel({ country, support }: Pick<CountryPickerProps, "country" | "support">) {
	if (!country) return <span className="truncate text-muted-foreground">Default</span>;
	const note = coverageNote(support, country);
	return (
		<span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
			<span className="truncate">{countryName(country)}</span>
			{note && <span className="shrink-0 text-xs text-amber-700">{note}</span>}
		</span>
	);
}

/**
 * Picks the country a prompt is asked from. Before committing, the footer says
 * which tracked models can't answer from the highlighted country and what a
 * prompt there costs.
 */
export function CountryPicker({
	country,
	onCountryChange,
	support,
	allowDefault = false,
	disabled,
	className,
}: CountryPickerProps) {
	const [open, setOpen] = useState(false);
	const [highlighted, setHighlighted] = useState<string>("");
	const brand = support.brandMarket;
	const previewed =
		highlighted === DEFAULT_ITEM
			? brand.country
			: (COUNTRIES.find((entry) => itemValue(entry.code) === highlighted)?.code ?? country ?? brand.country);
	// Opens on the current choice, so the footer describes what is set before anything is hovered.
	const setOpenOnCurrent = (next: boolean) => {
		if (next) setHighlighted(country ? itemValue(country) : DEFAULT_ITEM);
		setOpen(next);
	};

	const choose = (next: string | null) => {
		onCountryChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpenOnCurrent}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={disabled}
						aria-label={`Country: ${country ? countryName(country) : `brand default, ${countryName(brand.country)}`}`}
						className={cn(
							"h-8 w-full justify-between gap-1 px-2 font-normal",
							allowDefault && country && "border-foreground/30",
							className,
						)}
					/>
				}
			>
				<TriggerLabel country={country} support={support} />
				<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<Command value={highlighted} onValueChange={setHighlighted}>
					<CommandInput placeholder="Search countries..." />
					<CommandList className="max-h-56">
						<CommandEmpty>No country matches.</CommandEmpty>
						{allowDefault && (
							<CommandGroup>
								<CommandItem value={DEFAULT_ITEM} keywords={["brand", "default"]} onSelect={() => choose(null)}>
									<Check className={cn("size-3.5", country ? "opacity-0" : "opacity-100")} />
									<span className="flex-1">Brand Default</span>
									<span className="text-xs text-muted-foreground">{countryName(brand.country)}</span>
								</CommandItem>
							</CommandGroup>
						)}
						<CommandGroup heading="Countries">
							{COUNTRIES.map((entry) => {
								const note = coverageNote(support, entry.code);
								return (
									<CommandItem
										key={entry.code}
										value={itemValue(entry.code)}
										keywords={[entry.name]}
										onSelect={() => choose(entry.code)}
									>
										<Check className={cn("size-3.5", country === entry.code ? "opacity-100" : "opacity-0")} />
										<span className="flex-1">{entry.name}</span>
										{note && <span className="text-xs text-amber-700">{note}</span>}
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
				<div className="space-y-2 border-t bg-muted/40 p-3">
					<p className="text-xs font-medium">{countryName(previewed)}</p>
					{coverageNote(support, previewed) && <CountryCoverage support={support} country={previewed} />}
					<CountryCostNote support={support} country={previewed} />
				</div>
			</PopoverContent>
		</Popover>
	);
}
