import { MARKETS, type Market, marketCode, marketName, sameMarket } from "@workspace/config/markets";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@workspace/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import type { ReactElement, ReactNode } from "react";

/**
 * Searchable list of markets. With `selected`, each entry is a checkbox for
 * picking several; without, choosing one calls `onPick` once.
 */
export function MarketList({
	onPick,
	exclude = [],
	selected,
}: {
	onPick: (market: Market) => void;
	exclude?: readonly Market[];
	selected?: readonly Market[];
}) {
	const options = MARKETS.filter((market) => !exclude.some((taken) => sameMarket(taken, market)));
	return (
		<Command>
			<CommandInput placeholder="Search country or language…" />
			<CommandList className="max-h-64">
				<CommandEmpty>No market found.</CommandEmpty>
				{options.map((market) => (
					<CommandItem
						key={marketCode(market)}
						value={`${marketName(market)} ${marketCode(market)}`}
						onSelect={() => onPick(market)}
					>
						{selected && (
							<Checkbox checked={selected.some((m) => sameMarket(m, market))} className="pointer-events-none" />
						)}
						<span className="flex-1">{marketName(market)}</span>
						<span className="font-mono text-[10px] text-muted-foreground">{marketCode(market)}</span>
					</CommandItem>
				))}
			</CommandList>
		</Command>
	);
}

/** A button that opens `MarketList` in a popover. */
export function MarketPopover({
	trigger,
	label,
	children,
	open,
	onOpenChange,
}: {
	trigger: ReactElement;
	label: ReactNode;
	children: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger render={trigger}>{label}</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				{children}
			</PopoverContent>
		</Popover>
	);
}

/** Several markets at once, for adding the same prompts in each. */
export function MarketsPicker({ value, onChange }: { value: Market[]; onChange: (markets: Market[]) => void }) {
	const summary = value.length === 0 ? "Pick markets" : value.map(marketCode).join(", ");
	return (
		<MarketPopover
			trigger={
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-8 max-w-80 justify-start truncate font-mono text-xs"
					aria-label={`Markets to add in: ${summary}`}
				/>
			}
			label={summary}
		>
			<MarketList
				selected={value}
				onPick={(market) =>
					onChange(
						value.some((m) => sameMarket(m, market)) ? value.filter((m) => !sameMarket(m, market)) : [...value, market],
					)
				}
			/>
		</MarketPopover>
	);
}
