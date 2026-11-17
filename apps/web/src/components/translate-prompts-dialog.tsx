import {
	countryName,
	languageName,
	MARKETS,
	type Market,
	marketId,
	marketName,
	resolveMarket,
} from "@workspace/config/markets";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Spinner } from "@workspace/ui/components/spinner";
import { useMemo, useState } from "react";
import { coverageNote, describeCost } from "@/components/country-picker";
import { type MarketSupport, promptCostIn } from "@/lib/market-support";

export interface TranslationSource {
	groupId: string;
	value: string;
	country: string | null;
	language: string | null;
}

export interface TranslatedDraft {
	source: TranslationSource;
	market: Market;
	value: string;
}

export type TranslateFn = (market: Market, texts: string[]) => Promise<{ translation: string }[]>;

interface TranslatePromptsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sources: TranslationSource[];
	/** Every row in the editor, so a country and language a question is already asked in isn't offered twice. */
	existing: readonly TranslationSource[];
	support: MarketSupport;
	room: number;
	translate: TranslateFn;
	onTranslated: (drafts: TranslatedDraft[]) => void;
}

/**
 * The sources a market would add a prompt for: one per question that isn't asked
 * there yet, so selecting a prompt along with its variants translates it once.
 */
function sourcesMissing(
	market: Market,
	sources: TranslationSource[],
	existing: readonly TranslationSource[],
	brandMarket: Market,
): TranslationSource[] {
	const covered = new Set(
		existing.filter((row) => marketId(resolveMarket(row, brandMarket)) === marketId(market)).map((row) => row.groupId),
	);
	return sources.filter((source) => {
		if (covered.has(source.groupId)) return false;
		covered.add(source.groupId);
		return true;
	});
}

function AddedCost({
	support,
	additions,
}: {
	support: MarketSupport;
	additions: { market: Market; prompts: number }[];
}) {
	const prompts = additions.reduce((total, addition) => total + addition.prompts, 0);
	if (prompts === 0) {
		return <p className="text-sm text-muted-foreground">Pick where else to ask this.</p>;
	}
	const noun = prompts === 1 ? "prompt" : "prompts";
	if (support.promptAllowance) {
		const { used, max } = support.promptAllowance;
		return (
			<p className="text-sm">
				Adds <strong>{prompts}</strong> {noun}, each counted toward your plan: {used + prompts} of {max} in use after
				saving.
			</p>
		);
	}
	const costs = additions.map(({ market, prompts: count }) => ({ ...promptCostIn(support, market.country), count }));
	const callsPerDay = costs.reduce((total, cost) => total + cost.callsPerDay * cost.count, 0);
	const priced = costs.some((cost) => cost.monthlyUsd !== null);
	const monthlyUsd = priced ? costs.reduce((total, cost) => total + (cost.monthlyUsd ?? 0) * cost.count, 0) : null;
	return (
		<p className="text-sm">
			Adds <strong>{prompts}</strong> {noun}, each tracked on its own: {describeCost(callsPerDay, monthlyUsd)}
			{priced && " at estimated provider prices"}.
		</p>
	);
}

/** A prompt already written in a market's language is asked there as it stands; the rest are translated. */
async function draftsFor(
	additions: { market: Market; missing: TranslationSource[] }[],
	brandMarket: Market,
	translate: TranslateFn,
): Promise<TranslatedDraft[]> {
	const drafts: TranslatedDraft[] = [];
	for (const { market, missing } of additions) {
		const foreign = missing.filter((source) => resolveMarket(source, brandMarket).language !== market.language);
		const translated =
			foreign.length > 0
				? await translate(
						market,
						foreign.map((source) => source.value),
					)
				: [];
		for (const source of missing) {
			const index = foreign.indexOf(source);
			drafts.push({ source, market, value: index === -1 ? source.value : translated[index].translation });
		}
	}
	return drafts;
}

/**
 * Turns prompts into drafts for other countries and languages. Nothing is tracked or billed
 * until the editor saves the rows this hands back.
 */
export function TranslatePromptsDialog({
	open,
	onOpenChange,
	sources,
	existing,
	support,
	room,
	translate,
	onTranslated,
}: TranslatePromptsDialogProps) {
	const [selected, setSelected] = useState<string[]>([]);
	const [working, setWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const options = useMemo(
		() =>
			MARKETS.map((market) => ({
				market,
				id: marketId(market),
				missing: sourcesMissing(market, sources, existing, support.brandMarket),
			})),
		[sources, existing, support.brandMarket],
	);
	const additions = options
		.filter((option) => selected.includes(option.id))
		.map((option) => ({ market: option.market, prompts: option.missing.length, missing: option.missing }));
	const adding = additions.reduce((total, addition) => total + addition.prompts, 0);
	const overCapacity = adding > room;

	const close = (next: boolean) => {
		if (working) return;
		if (!next) {
			setSelected([]);
			setError(null);
		}
		onOpenChange(next);
	};

	const toggle = (id: string) =>
		setSelected((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));

	const run = async () => {
		setWorking(true);
		setError(null);
		try {
			const drafts = await draftsFor(additions, support.brandMarket, translate);
			onTranslated(drafts);
			setSelected([]);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't translate these prompts. Please try again.");
		} finally {
			setWorking(false);
		}
	};

	const title = sources.length === 1 ? "Translate Prompt" : `Translate ${sources.length} Prompts`;

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{sources.length === 1 ? `“${sources[0].value}”` : "Each prompt"} is added as a variant for every country and
						language you pick, translated once where the language differs. You can edit the wording before saving.
					</DialogDescription>
				</DialogHeader>

				<Command className="rounded-md border">
					<CommandInput placeholder="Search countries and languages..." />
					<CommandList className="max-h-60">
						<CommandEmpty>No country or language matches.</CommandEmpty>
						<CommandGroup>
							{options.map(({ market, id, missing }) => {
								const tracked = missing.length === 0;
								const note = coverageNote(support, market.country);
								return (
									<CommandItem
										key={id}
										value={id}
										keywords={[countryName(market.country), languageName(market.language), market.country]}
										disabled={tracked || working}
										onSelect={() => toggle(id)}
									>
										<Checkbox checked={selected.includes(id)} className="pointer-events-none" />
										<span className="flex-1">{marketName(market)}</span>
										{tracked ? (
											<span className="text-xs text-muted-foreground">Already tracked</span>
										) : (
											note && <span className="text-xs text-amber-700">{note}</span>
										)}
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>

				<AddedCost support={support} additions={additions} />
				{overCapacity && (
					<p role="alert" className="text-sm text-destructive">
						That is {adding - room} more than the list has room for. Pick fewer countries or prompts.
					</p>
				)}
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => close(false)} disabled={working} className="cursor-pointer">
						Cancel
					</Button>
					<Button onClick={run} disabled={adding === 0 || overCapacity || working} className="cursor-pointer">
						{working && <Spinner className="size-3.5" />}
						{adding > 0 ? `Add ${adding} ${adding === 1 ? "Prompt" : "Prompts"}` : "Add Prompts"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
