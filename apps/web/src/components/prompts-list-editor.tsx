/**
 * Shared prompts table — used by the settings/prompts page (manages a brand's
 * full prompt list) and the prompt wizard's Review step (picks from
 * AI-suggested prompts + custom additions).
 *
 * Controlled component: the caller owns the `prompts` array and the change
 * callback. The settings page wraps it with save/server logic; the wizard
 * keeps it inline. The `showSystemTags` prop hides the System Tags column
 * in the wizard since onboarding hasn't yet computed any system tags.
 */

import { IconInfoCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { DEFAULT_COUNTRY } from "@workspace/config/countries";
import { DEFAULT_LANGUAGE } from "@workspace/config/languages";
import { getModelMeta } from "@workspace/config/models";
import {
	PREMIUM_MODELS,
	PREMIUM_RUNS_PER_DAY,
	premiumModelLabel,
	premiumSlotsUsed,
	selectPremiumModels,
} from "@workspace/config/plans";
import { describeSkipped, parseBulkPromptsInCountries } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Switch } from "@workspace/ui/components/switch";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { Inbox, ListPlus, Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { CountriesPicker, LanguageSelect } from "@/components/market-select";
import { type GroupSummary, type Market, MarketField, PromptGroupField } from "@/components/prompt-group-field";
import { useOrganizationParams } from "@/hooks/use-route-params";

export interface EditablePrompt {
	id?: string;
	_key: string;
	value: string;
	enabled: boolean;
	/** Editable until the prompt is saved; after that it's part of what the prompt measures. */
	country: string;
	language: string;
	/** Prompts sharing one are variants of the same question. */
	groupId: string;
	tags: string[];
	systemTags: string[];
	premiumModels: string[];
}

export interface PremiumAllowance {
	total: number;
	assignedElsewhere: number;
}

export function newPromptEntry(partial?: Partial<EditablePrompt>): EditablePrompt {
	return {
		_key: uuidv4(),
		value: partial?.value ?? "",
		enabled: partial?.enabled ?? true,
		country: partial?.country ?? DEFAULT_COUNTRY,
		language: partial?.language ?? DEFAULT_LANGUAGE,
		groupId: partial?.groupId ?? uuidv4(),
		tags: partial?.tags ?? [],
		systemTags: partial?.systemTags ?? [],
		premiumModels: partial?.premiumModels ?? [],
		...(partial?.id ? { id: partial.id } : {}),
	};
}

/** Both places that offer more pairings send you to the same page. */
function BillingLink({ children }: { children: ReactNode }) {
	const params = useOrganizationParams();
	return (
		<Link to="/app/org/$org/settings/billing" params={params} className="underline">
			{children}
		</Link>
	);
}

/**
 * Which premium models a prompt is tracked on. A popover rather than a checkbox
 * per model because the table has one narrow column for this and the list grows
 * as more models ship a usable web-search tool.
 */
function PremiumModelsField({
	selected,
	promptEnabled,
	atCapacity,
	onChange,
	showLabel,
}: {
	selected: string[];
	promptEnabled: boolean;
	atCapacity: boolean;
	onChange: (models: string[]) => void;
	showLabel?: boolean;
}) {
	const summary = selected.length === 0 ? "None" : selected.map(premiumModelLabel).join(", ");

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!promptEnabled}
						className="h-8 w-full justify-center gap-1 px-2"
						aria-label={`Premium models: ${summary}`}
					/>
				}
			>
				{selected.length === 0 ? (
					<span className="text-muted-foreground">{showLabel ? "Premium: none" : "—"}</span>
				) : (
					<>
						{selected.map((model) => (
							<ModelIcon key={model} iconId={getModelMeta(model).iconId} className="size-3.5" />
						))}
						{showLabel && <span className="ml-1 text-xs">{summary}</span>}
					</>
				)}
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 space-y-1 p-2">
				{PREMIUM_MODELS.map((model) => {
					const checked = selected.includes(model);
					return (
						<button
							type="button"
							key={model}
							disabled={atCapacity && !checked}
							// Normalized through the catalog on every toggle, because that is
							// what the server stores — appending in click order instead would
							// reshuffle the row the moment a save came back.
							onClick={() =>
								onChange(selectPremiumModels(checked ? selected.filter((m) => m !== model) : [...selected, model]))
							}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Checkbox checked={checked} disabled={atCapacity && !checked} className="pointer-events-none" />
							<ModelIcon iconId={getModelMeta(model).iconId} className="size-4" />
							<span className="flex-1">{premiumModelLabel(model)}</span>
							<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
								{PREMIUM_RUNS_PER_DAY}×/day
							</span>
						</button>
					);
				})}
				{atCapacity && (
					<p className="px-2 pt-1 text-xs text-muted-foreground">
						No premium pairings left. Untick one, or <BillingLink>buy more</BillingLink>.
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}

/**
 * Every column layout the table can take, spelled out rather than assembled at
 * runtime: Tailwind only generates class names that appear literally in source.
 */
const GRID_COLS: Record<string, string> = {
	"system-basic": "md:grid-cols-[2.25rem_minmax(0,1fr)_6rem_minmax(14rem,1fr)_2.75rem]",
	"system-premium": "md:grid-cols-[2.25rem_minmax(0,1fr)_6rem_minmax(14rem,1fr)_5.5rem_2.75rem]",
	"plain-basic": "md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(14rem,1fr)_2.75rem]",
	"plain-premium": "md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(14rem,1fr)_5.5rem_2.75rem]",
	"system-market-basic": "md:grid-cols-[2.25rem_minmax(0,1fr)_6rem_14rem_3.5rem_minmax(12rem,1fr)_2.75rem]",
	"system-market-premium": "md:grid-cols-[2.25rem_minmax(0,1fr)_6rem_14rem_3.5rem_minmax(12rem,1fr)_5.5rem_2.75rem]",
	"plain-market-basic": "md:grid-cols-[2.25rem_minmax(0,1fr)_14rem_3.5rem_minmax(12rem,1fr)_2.75rem]",
	"plain-market-premium": "md:grid-cols-[2.25rem_minmax(0,1fr)_14rem_3.5rem_minmax(12rem,1fr)_5.5rem_2.75rem]",
};

interface PromptsListEditorProps {
	prompts: EditablePrompt[];
	onChange: (next: EditablePrompt[]) => void;
	/** Show the read-only System Tags column. Default true. */
	showSystemTags?: boolean;
	/** `_key`s of rows edited since the last save, flagged with an accent rail
	 *  so a change is findable in a list of up to {@link MAX_PROMPTS} rows. */
	changedKeys?: ReadonlySet<string>;
	/** Omit to hide the premium column — self-hosted, or a plan with no pool. */
	premium?: PremiumAllowance;
	/** Where, and in what language, new prompts start. Omit to hide the
	 *  country, language, and group columns and add every prompt in the
	 *  defaults (the onboarding wizard). */
	newPromptMarket?: Market;
}

/**
 * The bulk-paste box's state. The parse is pure and lives in @workspace/lib so
 * the rules (trim, dedupe, cap) are tested without a DOM; it runs on every
 * keystroke only to label the button and warn about what will be dropped.
 */
function useBulkPaste(
	filled: { value: string; country: string }[],
	defaultMarket: Market,
	onAdd: (prompts: { value: string; country: string; language: string }[]) => void,
) {
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkText, setBulkText] = useState("");
	const [bulkCountries, setBulkCountries] = useState<string[] | null>(null);
	const [bulkLanguage, setBulkLanguage] = useState<string | null>(null);
	const countries = useMemo(() => bulkCountries ?? [defaultMarket.country], [bulkCountries, defaultMarket.country]);
	const language = bulkLanguage ?? defaultMarket.language;

	const bulkPreview = useMemo(
		() => parseBulkPromptsInCountries(bulkText, { existing: filled, countries, limit: MAX_PROMPTS }),
		[bulkText, filled, countries],
	);

	// Over capacity blocks the whole paste rather than quietly taking the lines
	// that fit, so nobody submits a list believing all of it landed.
	const overCapacity = bulkPreview.skipped.overCapacity.length;
	const closeBulk = () => {
		setBulkOpen(false);
		setBulkText("");
		setBulkCountries(null);
		setBulkLanguage(null);
	};

	return {
		bulkOpen,
		setBulkOpen,
		bulkText,
		setBulkText,
		bulkCountries: countries,
		setBulkCountries,
		bulkLanguage: language,
		setBulkLanguage,
		bulkPreview,
		bulkNotice: bulkText.trim().length > 0 ? describeSkipped(bulkPreview.skipped) : null,
		bulkError:
			overCapacity > 0
				? `This paste is ${overCapacity} prompt${overCapacity === 1 ? "" : "s"} over the ${MAX_PROMPTS} limit. Remove ${overCapacity === 1 ? "a line" : "some lines"} to continue.`
				: null,
		closeBulk,
		addBulk: () => {
			if (bulkPreview.added.length === 0 || overCapacity > 0) return;
			onAdd(bulkPreview.added.map((prompt) => ({ ...prompt, language })));
			closeBulk();
		},
	};
}

/**
 * Which rows are ticked. Counted against the current prompts so stale keys
 * (e.g. after the wizard regenerates suggestions) don't linger in the tally.
 */
function useRowSelection(prompts: EditablePrompt[]) {
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
	const liveSelectedCount = prompts.reduce((count, p) => (selectedKeys.has(p._key) ? count + 1 : count), 0);
	const allSelected = prompts.length > 0 && liveSelectedCount === prompts.length;

	return {
		selectedKeys,
		liveSelectedCount,
		allSelected,
		toggleSelect: (key: string) =>
			setSelectedKeys((prev) => {
				const next = new Set(prev);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			}),
		toggleSelectAll: () => setSelectedKeys(allSelected ? new Set() : new Set(prompts.map((p) => p._key))),
		clearSelection: () => setSelectedKeys(new Set()),
	};
}

function ColumnHeader({
	gridCols,
	showSystemTags,
	showMarket,
	premium,
	allSelected,
	onToggleSelectAll,
	disabled,
}: {
	gridCols: string;
	showSystemTags: boolean;
	showMarket: boolean;
	premium?: PremiumAllowance;
	allSelected: boolean;
	onToggleSelectAll: () => void;
	disabled: boolean;
}) {
	return (
		<div className={`hidden md:grid ${gridCols} gap-2 text-sm font-medium text-muted-foreground border-b pb-2`}>
			<div className="flex justify-center">
				<Checkbox
					checked={allSelected}
					onCheckedChange={onToggleSelectAll}
					disabled={disabled}
					aria-label={allSelected ? "Deselect all prompts" : "Select all prompts"}
				/>
			</div>
			<div className="flex items-center gap-1 min-w-0">
				Prompt Text
				<Tooltip>
					<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
					<TooltipContent>
						<p className="max-w-xs">The question or query that will be sent to AI models for evaluation.</p>
					</TooltipContent>
				</Tooltip>
			</div>
			{showSystemTags && (
				<div className="hidden md:flex items-center gap-1">
					System
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent>
							<p className="max-w-xs">
								Auto-generated tags like &quot;branded&quot; or &quot;unbranded&quot; based on prompt content.
							</p>
						</TooltipContent>
					</Tooltip>
				</div>
			)}
			{showMarket && (
				<>
					<div className="flex items-center gap-1 min-w-0">
						Country · Language
						<Tooltip>
							<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
							<TooltipContent>
								<p className="max-w-xs">
									Where the prompt is asked from and the language it's written in. AI answers and the sources they cite
									differ by both. Fixed once saved: add a variant to track the prompt somewhere else.
								</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<div className="flex items-center justify-center gap-1">
						Group
						<Tooltip>
							<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
							<TooltipContent>
								<p className="max-w-xs">
									Variants of the same question in other countries or languages. The dashboard shows a group together so
									the markets can be compared.
								</p>
							</TooltipContent>
						</Tooltip>
					</div>
				</>
			)}
			<div className="flex items-center gap-1 min-w-0">
				Tags
				<Tooltip>
					<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
					<TooltipContent>
						<p className="max-w-xs">Custom labels to organize and filter prompts.</p>
					</TooltipContent>
				</Tooltip>
			</div>
			{premium && (
				<div className="flex items-center justify-center gap-1">
					Premium
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent>
							<p className="max-w-xs">
								Also track this prompt on a model called directly with its own web search on, for a grounded answer with
								citations — {PREMIUM_RUNS_PER_DAY}× a day. Each model you pick here spends one of the
								organization&apos;s premium pairings. This is on top of the platforms the brand tracks, which run on
								every prompt either way.
							</p>
						</TooltipContent>
					</Tooltip>
				</div>
			)}
			<div className="flex justify-center">
				<span className="sr-only">Enabled</span>
			</div>
		</div>
	);
}

function PromptRow({
	prompt,
	index,
	total,
	update,
	allTagOptions,
	showSystemTags,
	marketControls,
	isVariant,
	changedKeys,
	premium,
	premiumAtCapacity,
	gridCols,
	selected,
	onToggleSelect,
}: {
	prompt: EditablePrompt;
	index: number;
	total: number;
	update: (index: number, patch: Partial<EditablePrompt>) => void;
	allTagOptions: { value: string }[];
	showSystemTags: boolean;
	/** The country/language and group cells, when the table shows them. */
	marketControls?: { market: ReactNode; group: ReactNode };
	/** Follows another member of its group, so it's drawn as nested under it. */
	isVariant: boolean;
	changedKeys?: ReadonlySet<string>;
	premium?: PremiumAllowance;
	premiumAtCapacity: boolean;
	gridCols: string;
	selected: boolean;
	onToggleSelect: () => void;
}) {
	return (
		<div
			className={cn(
				"-ml-3 border-l-2 pl-3 transition-colors",
				changedKeys?.has(prompt._key) ? "border-amber-500" : "border-transparent",
				!prompt.enabled && "opacity-60",
			)}
		>
			{changedKeys?.has(prompt._key) && <span className="sr-only">Has unsaved changes</span>}
			{/* Mobile: stacked, no selection/bulk */}
			<div className={`md:hidden flex flex-col gap-2 pb-3 ${index < total - 1 ? "border-b" : ""}`}>
				<div className="flex items-start gap-2">
					<Input
						value={prompt.value}
						onChange={(e) => update(index, { value: e.target.value })}
						placeholder="Enter prompt text..."
						className="min-w-0 flex-1"
					/>
					<div className="pt-2">
						<Switch
							checked={prompt.enabled}
							onCheckedChange={(checked) => update(index, { enabled: checked })}
							aria-label={prompt.enabled ? "Disable prompt" : "Enable prompt"}
						/>
					</div>
				</div>
				{marketControls && (
					<div className="flex gap-2">
						<div className="min-w-0 flex-1">{marketControls.market}</div>
						<div className="w-16">{marketControls.group}</div>
					</div>
				)}
				<TagsInput
					value={prompt.tags}
					onValueChange={(tags) => update(index, { tags })}
					options={allTagOptions}
					placeholder="Add tag..."
					searchPlaceholder="Search or create tag..."
					normalizeValue={(raw) => raw.toLowerCase().trim()}
				/>
				{premium && (
					<PremiumModelsField
						selected={prompt.premiumModels}
						promptEnabled={prompt.enabled}
						atCapacity={premiumAtCapacity}
						onChange={(premiumModels) => update(index, { premiumModels })}
						showLabel
					/>
				)}
			</div>

			{/* Desktop (md+): single-line grid */}
			<div className={`hidden md:grid ${gridCols} gap-2 items-start`}>
				<div className="flex justify-center pt-2">
					<Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select prompt" />
				</div>
				<div className={cn("flex min-w-0 items-center gap-1.5", isVariant && "pl-4")}>
					{isVariant && (
						<span className="text-muted-foreground" aria-hidden>
							↳
						</span>
					)}
					<Input
						value={prompt.value}
						onChange={(e) => update(index, { value: e.target.value })}
						placeholder="Enter prompt text..."
						className="min-w-0"
					/>
				</div>
				{showSystemTags && <TagsInput value={prompt.systemTags} onValueChange={() => {}} disabled placeholder="—" />}
				{marketControls && (
					<>
						{marketControls.market}
						<div className="flex justify-center pt-0.5">{marketControls.group}</div>
					</>
				)}
				<TagsInput
					value={prompt.tags}
					onValueChange={(tags) => update(index, { tags })}
					options={allTagOptions}
					placeholder="Add tag..."
					searchPlaceholder="Search or create tag..."
					normalizeValue={(raw) => raw.toLowerCase().trim()}
				/>
				{premium && (
					<div className="flex justify-center pt-1">
						<PremiumModelsField
							selected={prompt.premiumModels}
							promptEnabled={prompt.enabled}
							atCapacity={premiumAtCapacity}
							onChange={(premiumModels) => update(index, { premiumModels })}
						/>
					</div>
				)}
				<div className="flex justify-center pt-2">
					<Switch
						checked={prompt.enabled}
						onCheckedChange={(checked) => update(index, { enabled: checked })}
						aria-label={prompt.enabled ? "Disable prompt" : "Enable prompt"}
					/>
				</div>
			</div>
		</div>
	);
}

/** Each group's members in list order, read as the first member's text. */
function summarizeGroups(prompts: EditablePrompt[]): Map<string, GroupSummary> {
	const groups = new Map<string, GroupSummary>();
	for (const prompt of prompts) {
		const group = groups.get(prompt.groupId) ?? { groupId: prompt.groupId, label: "", markets: [] };
		if (!group.label && prompt.value.trim()) group.label = prompt.value.trim();
		group.markets.push({ country: prompt.country, language: prompt.language });
		groups.set(prompt.groupId, group);
	}
	return groups;
}

/** Inserts a row right after the last member of its group, so a group stays together on screen. */
function placeInGroup(prompts: EditablePrompt[], entry: EditablePrompt): EditablePrompt[] {
	let last = -1;
	prompts.forEach((prompt, i) => {
		if (prompt.groupId === entry.groupId) last = i;
	});
	if (last === -1) return [...prompts, entry];
	return [...prompts.slice(0, last + 1), entry, ...prompts.slice(last + 1)];
}

function BulkPasteBox({ bulk, showMarket }: { bulk: ReturnType<typeof useBulkPaste>; showMarket: boolean }) {
	return (
		<div className="space-y-2 rounded-md border bg-muted/40 p-3">
			<Textarea
				value={bulk.bulkText}
				onChange={(e) => bulk.setBulkText(e.target.value)}
				placeholder="One prompt per line"
				rows={6}
				aria-label="Prompts to add, one per line"
			/>
			{showMarket && (
				<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<span>Run from</span>
					<CountriesPicker value={bulk.bulkCountries} onChange={bulk.setBulkCountries} />
					<span>in</span>
					<LanguageSelect value={bulk.bulkLanguage} onChange={bulk.setBulkLanguage} className="h-8 w-40" />
					{bulk.bulkCountries.length > 1 && (
						<span className="text-xs">Each line is added once per country, grouped together.</span>
					)}
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					type="button"
					onClick={bulk.addBulk}
					disabled={bulk.bulkPreview.added.length === 0 || bulk.bulkError !== null}
				>
					Add {bulk.bulkPreview.added.length > 0 ? `${bulk.bulkPreview.added.length} ` : ""}
					{bulk.bulkPreview.added.length === 1 ? "Prompt" : "Prompts"}
				</Button>
				<Button variant="ghost" size="sm" type="button" onClick={bulk.closeBulk}>
					Cancel
				</Button>
				{bulk.bulkNotice && <span className="text-xs text-muted-foreground">{bulk.bulkNotice}</span>}
			</div>
			{bulk.bulkError && (
				<p role="alert" className="text-xs text-destructive">
					{bulk.bulkError}
				</p>
			)}
		</div>
	);
}

export function PromptsListEditor({
	prompts,
	onChange,
	showSystemTags = true,
	changedKeys,
	premium,
	newPromptMarket,
}: PromptsListEditorProps) {
	const allTagOptions = useMemo(() => {
		const set = new Set<string>();
		for (const p of prompts) for (const t of p.tags) set.add(t);
		return [...set].sort().map((t) => ({ value: t }));
	}, [prompts]);

	const update = (index: number, patch: Partial<EditablePrompt>) => {
		onChange(prompts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
	};
	const add = () => {
		if (prompts.length >= MAX_PROMPTS) return;
		onChange([...prompts, newPromptEntry(defaultMarket)]);
	};

	// A row only takes a slot once it has text. Blank rows are how this editor
	// stages a new prompt and they're dropped on save, so counting them against
	// the cap would refuse prompts the list still has room for.
	const filled = useMemo(() => prompts.filter((p) => p.value.trim().length > 0), [prompts]);
	const atCapacity = filled.length >= MAX_PROMPTS;
	const showMarket = newPromptMarket !== undefined;
	const defaultMarket = newPromptMarket ?? { country: DEFAULT_COUNTRY, language: DEFAULT_LANGUAGE };

	// One paste line added in several countries becomes one group.
	const bulk = useBulkPaste(filled, defaultMarket, (added) => {
		const groupByValue = new Map<string, string>();
		const entries = added.map((prompt) => {
			const groupId = groupByValue.get(prompt.value) ?? uuidv4();
			groupByValue.set(prompt.value, groupId);
			return newPromptEntry({ ...prompt, groupId });
		});
		onChange([...prompts, ...entries]);
	});

	const groups = useMemo(() => summarizeGroups(prompts), [prompts]);
	const groupControls = (prompt: EditablePrompt, index: number) => {
		const group = groups.get(prompt.groupId);
		if (!group) return undefined;
		return {
			market: <MarketField market={prompt} saved={Boolean(prompt.id)} onChange={(market) => update(index, market)} />,
			group: (
				<PromptGroupField
					group={group}
					otherGroups={[...groups.values()].filter((other) => other.groupId !== prompt.groupId)}
					defaultMarket={defaultMarket}
					onAddVariant={(market) =>
						onChange(
							placeInGroup(
								prompts,
								newPromptEntry({ value: prompt.value, tags: prompt.tags, groupId: prompt.groupId, ...market }),
							),
						)
					}
					onMove={(groupId) =>
						onChange(
							placeInGroup(
								prompts.filter((_, i) => i !== index),
								{ ...prompt, groupId },
							),
						)
					}
					onSeparate={() => update(index, { groupId: uuidv4() })}
				/>
			),
		};
	};

	const { selectedKeys, liveSelectedCount, allSelected, toggleSelect, toggleSelectAll, clearSelection } =
		useRowSelection(prompts);

	const applyEnabledToSelection = (enabled: boolean) => {
		if (liveSelectedCount === 0) return;
		onChange(prompts.map((p) => (selectedKeys.has(p._key) ? { ...p, enabled } : p)));
	};

	const validCount = prompts.filter((p) => p.enabled && p.value.trim().length > 0).length;

	// Live pool usage: other brands' assignments plus whatever is ticked here,
	// so the cap applies before a save rather than being rejected by the server.
	const premiumUsed = premium ? premium.assignedElsewhere + premiumSlotsUsed(prompts) : 0;
	const premiumAtCapacity = premium ? premiumUsed >= premium.total : false;

	// Desktop layout only — column order is
	// [select] [text] [system?] [country?] [tags] [premium?] [switch]. Mobile
	// renders a stacked per-prompt block instead (no selection, no bulk).
	const gridCols =
		GRID_COLS[`${showSystemTags ? "system" : "plain"}${showMarket ? "-market" : ""}-${premium ? "premium" : "basic"}`];

	return (
		<div className="space-y-4">
			{liveSelectedCount > 0 && (
				<div className="hidden md:flex flex-wrap items-center justify-between gap-x-2 gap-y-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
					<span className="text-muted-foreground">
						<strong className="text-foreground">{liveSelectedCount}</strong> selected
					</span>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => applyEnabledToSelection(true)}
							className="cursor-pointer"
						>
							Enable
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => applyEnabledToSelection(false)}
							className="cursor-pointer"
						>
							Disable
						</Button>
						<Button type="button" size="sm" variant="ghost" onClick={clearSelection} className="cursor-pointer">
							Clear
						</Button>
					</div>
				</div>
			)}

			{premium && (
				<p className="text-sm text-muted-foreground">
					Premium:{" "}
					<span className="font-medium text-foreground">
						{premiumUsed} of {premium.total}
					</span>{" "}
					pairings in use across this organization — one for each model a prompt is tracked on.
					{premiumAtCapacity && (
						<>
							{" "}
							Unassign one to free it up, or <BillingLink>buy more</BillingLink>.
						</>
					)}
				</p>
			)}

			<ColumnHeader
				gridCols={gridCols}
				showSystemTags={showSystemTags}
				showMarket={showMarket}
				premium={premium}
				allSelected={allSelected}
				onToggleSelectAll={toggleSelectAll}
				disabled={prompts.length === 0}
			/>

			{prompts.length === 0 ? (
				<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
					<div className="text-center py-8 text-muted-foreground">
						<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p>No prompts yet.</p>
					</div>
				</div>
			) : (
				<div className="space-y-3">
					{prompts.map((prompt, index) => (
						<PromptRow
							key={prompt._key}
							prompt={prompt}
							index={index}
							total={prompts.length}
							update={update}
							allTagOptions={allTagOptions}
							showSystemTags={showSystemTags}
							marketControls={showMarket ? groupControls(prompt, index) : undefined}
							isVariant={showMarket && index > 0 && prompts[index - 1].groupId === prompt.groupId}
							changedKeys={changedKeys}
							premium={premium}
							premiumAtCapacity={premiumAtCapacity}
							gridCols={gridCols}
							selected={selectedKeys.has(prompt._key)}
							onToggleSelect={() => toggleSelect(prompt._key)}
						/>
					))}
				</div>
			)}

			{!atCapacity && (
				<div className="flex flex-wrap items-center gap-2">
					{prompts.length < MAX_PROMPTS && (
						<Button
							variant="outline"
							size="sm"
							type="button"
							onClick={add}
							className="flex items-center gap-2 cursor-pointer"
						>
							<Plus className="h-4 w-4" /> Add Prompt
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={() => bulk.setBulkOpen((open) => !open)}
						className="flex items-center gap-2 cursor-pointer"
					>
						<ListPlus className="h-4 w-4" /> Add Multiple
					</Button>
				</div>
			)}

			{bulk.bulkOpen && !atCapacity && <BulkPasteBox bulk={bulk} showMarket={showMarket} />}

			{atCapacity && (
				<p className="text-xs text-muted-foreground">
					Maximum of {MAX_PROMPTS} prompts allowed. Remove a prompt to add a new one.
				</p>
			)}

			<p className="text-xs text-muted-foreground">
				<strong>
					{validCount}/{MAX_PROMPTS}
				</strong>{" "}
				prompts configured
			</p>
		</div>
	);
}
