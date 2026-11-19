import { LANGUAGES, type Market, resolveMarket } from "@workspace/config/markets";
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
import { useState } from "react";
import type { MarketSupport } from "@/lib/market-support";

export interface TranslationSource {
	groupId: string;
	value: string;
	country: string | null;
	language: string | null;
}

export interface TranslatedDraft {
	source: TranslationSource;
	language: string;
	value: string;
}

/** `languages` are what each text is saved under, null where it has none. Text already in the market's language comes back as written. */
export type TranslateFn = (
	market: Market,
	texts: string[],
	languages: (string | null)[],
) => Promise<{ translation: string }[]>;

interface TranslatePromptsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	source: TranslationSource | null;
	/** Every row in the editor, so a language the question is already asked in isn't offered twice. */
	existing: readonly TranslationSource[];
	support: MarketSupport;
	room: number;
	translate: TranslateFn;
	onTranslated: (drafts: TranslatedDraft[]) => void;
}

/**
 * Adds a prompt in other languages as variants, asked from the same country.
 * Nothing is tracked or billed until the editor saves the rows this hands back.
 */
export function TranslatePromptsDialog({
	open,
	onOpenChange,
	source,
	existing,
	support,
	room,
	translate,
	onTranslated,
}: TranslatePromptsDialogProps) {
	const [selected, setSelected] = useState<string[]>([]);
	const [working, setWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const languageOf = (row: TranslationSource) => resolveMarket(row, support.brandMarket).language;
	const taken = new Set(existing.filter((row) => row.groupId === source?.groupId).map(languageOf));
	const overCapacity = selected.length > room;

	const close = (next: boolean) => {
		if (working) return;
		if (!next) {
			setSelected([]);
			setError(null);
		}
		onOpenChange(next);
	};

	const toggle = (code: string) =>
		setSelected((prev) => (prev.includes(code) ? prev.filter((entry) => entry !== code) : [...prev, code]));

	const run = async () => {
		if (!source) return;
		setWorking(true);
		setError(null);
		try {
			const { country } = resolveMarket(source, support.brandMarket);
			const drafts: TranslatedDraft[] = [];
			for (const language of selected) {
				const [translated] = await translate({ country, language }, [source.value], [source.language]);
				drafts.push({ source, language, value: translated.translation });
			}
			onTranslated(drafts);
			setSelected([]);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't translate this prompt. Please try again.");
		} finally {
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Translate Prompt</DialogTitle>
					<DialogDescription>
						Choose the languages to translate “{source?.value}” into. Each becomes a variant you can edit before saving.
					</DialogDescription>
				</DialogHeader>

				<Command className="rounded-md border">
					<CommandInput placeholder="Search languages..." />
					<CommandList className="max-h-60">
						<CommandEmpty>No language matches.</CommandEmpty>
						<CommandGroup>
							{LANGUAGES.map((language) => (
								<CommandItem
									key={language.code}
									value={language.name}
									disabled={taken.has(language.code) || working}
									onSelect={() => toggle(language.code)}
								>
									<Checkbox checked={selected.includes(language.code)} className="pointer-events-none" />
									<span className="flex-1">{language.name}</span>
									{taken.has(language.code) && <span className="text-xs text-muted-foreground">Already added</span>}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>

				{overCapacity && (
					<p role="alert" className="text-sm text-destructive">
						That is {selected.length - room} more than the list has room for. Choose fewer languages.
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
					<Button onClick={run} disabled={selected.length === 0 || overCapacity || working} className="cursor-pointer">
						{working && <Spinner className="size-3.5" />}
						{selected.length > 1 ? `Add ${selected.length} Variants` : "Add Variant"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
