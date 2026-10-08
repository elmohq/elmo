import { COUNTRIES, countryName, DEFAULT_COUNTRY } from "@workspace/config/countries";
import { DEFAULT_LANGUAGE, languageName } from "@workspace/config/languages";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { ChevronDown, MoreHorizontal } from "lucide-react";
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

const chipClass = "h-7 shrink-0 gap-1 px-2 font-mono text-xs";

/** The default market if the group doesn't have it yet, else the first country it lacks in that language. */
export function firstOpenMarket(taken: Market[], preferred?: Market): Market {
	const language = preferred?.language ?? DEFAULT_LANGUAGE;
	const has = (country: string) => taken.some((m) => m.country === country && m.language === language);
	const country = [preferred?.country ?? DEFAULT_COUNTRY, ...COUNTRIES.map((c) => c.code)].find((c) => !has(c));
	return { country: country ?? DEFAULT_COUNTRY, language };
}

/**
 * Where a prompt is asked from and in what language, as a compact chip beside
 * its text. A picker until the prompt is saved; fixed after that.
 */
export function MarketChip({
	market,
	saved,
	onChange,
}: {
	market: Market;
	saved: boolean;
	onChange: (market: Market) => void;
}) {
	const full = `${countryName(market.country)}, ${languageName(market.language)}`;
	if (saved) {
		return (
			<Tooltip>
				<TooltipTrigger
					render={
						<span className="inline-flex h-7 shrink-0 cursor-default items-center rounded-md border bg-muted/50 px-2 font-mono text-xs text-muted-foreground" />
					}
				>
					{marketLabel(market)}
				</TooltipTrigger>
				<TooltipContent>
					<p className="max-w-xs">
						Asked from {full}. Fixed once saved. Use “Add country or language” to track it somewhere else.
					</p>
				</TooltipContent>
			</Tooltip>
		);
	}
	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button type="button" variant="outline" size="sm" className={chipClass} aria-label={`Market: ${full}`} />
				}
			>
				{marketLabel(market)}
				<ChevronDown className="size-3 text-muted-foreground" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 space-y-2 p-3">
				<p className="text-xs text-muted-foreground">
					Where the prompt is asked from, and the language it's written in.
				</p>
				<CountrySelect
					value={market.country}
					onChange={(country) => onChange({ ...market, country })}
					className="h-9 w-full"
				/>
				<LanguageSelect
					value={market.language}
					onChange={(language) => onChange({ ...market, language })}
					className="h-9 w-full"
				/>
			</PopoverContent>
		</Popover>
	);
}

/** Per-row actions for grouping: add a variant, move to another group, or leave one. */
export function PromptRowMenu({
	inGroup,
	otherGroups,
	onAddVariant,
	onMove,
	onSeparate,
}: {
	inGroup: boolean;
	otherGroups: GroupSummary[];
	onAddVariant: () => void;
	onMove: (groupId: string) => void;
	onSeparate: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Prompt actions" />}
			>
				<MoreHorizontal className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuItem onClick={onAddVariant}>Add country or language</DropdownMenuItem>
				{otherGroups.length > 0 && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>Group with…</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="max-h-72 w-72 overflow-y-auto">
							{otherGroups.map((group) => (
								<DropdownMenuItem key={group.groupId} onClick={() => onMove(group.groupId)}>
									<span className="min-w-0 flex-1 truncate">{group.label || "Untitled"}</span>
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
										{group.markets.map(marketLabel).join(", ")}
									</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}
				{inGroup && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onSeparate}>Remove from group</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
