import { IconInfoCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { type Market, marketName, resolveMarket } from "@workspace/config/markets";
import { getModelMeta } from "@workspace/config/models";
import {
	PREMIUM_MODELS,
	PREMIUM_RUNS_PER_DAY,
	premiumModelLabel,
	premiumSlotsUsed,
	selectPremiumModels,
} from "@workspace/config/plans";
import { describeSkipped, parseBulkPrompts } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { CopyPlus, CornerDownRight, Inbox, Languages, ListPlus, Plus, Sparkles, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { MarketCostNote, MarketPicker } from "@/components/market-picker";
import { type TranslatedDraft, type TranslateFn, TranslatePromptsDialog } from "@/components/translate-prompts-dialog";
import { useBrandParams, useOrganizationParams } from "@/hooks/use-route-params";
import type { MarketSupport } from "@/lib/market-support";
import { countVariants, groupLeads, insertIntoGroup } from "@/lib/prompt-variants";

export interface EditablePrompt {
	id?: string;
	_key: string;
	/** Shared by a prompt and its variants. */
	groupId: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
	premiumModels: string[];
	/** Null follows the brand's market. */
	country: string | null;
	language: string | null;
	suggested?: boolean;
	/** A machine translation nobody has saved yet. */
	translated?: boolean;
}

/** What the editor needs to offer markets. Omitted where prompts are only being drafted, like onboarding. */
export interface PromptMarkets {
	support: MarketSupport;
	translate: TranslateFn;
}

export interface PremiumAllowance {
	total: number;
	assignedElsewhere: number;
}

export function newPromptEntry(partial?: Partial<EditablePrompt>): EditablePrompt {
	return {
		_key: uuidv4(),
		groupId: partial?.groupId ?? uuidv4(),
		value: partial?.value ?? "",
		enabled: partial?.enabled ?? true,
		tags: partial?.tags ?? [],
		systemTags: partial?.systemTags ?? [],
		premiumModels: partial?.premiumModels ?? [],
		country: partial?.country ?? null,
		language: partial?.language ?? null,
		...(partial?.id ? { id: partial.id } : {}),
		...(partial?.suggested ? { suggested: true } : {}),
		...(partial?.translated ? { translated: true } : {}),
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
	"system-basic-market": "md:grid-cols-[2.25rem_minmax(0,1fr)_6rem_minmax(10rem,1fr)_7rem_2.75rem]",
	"system-premium-market": "md:grid-cols-[2.25rem_minmax(0,1fr)_6rem_minmax(10rem,1fr)_7rem_5.5rem_2.75rem]",
	"plain-basic-market": "md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(10rem,1fr)_7rem_2.75rem]",
	"plain-premium-market": "md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(10rem,1fr)_7rem_5.5rem_2.75rem]",
};

/** Columns: [select] [text] [system?] [tags] [market?] [premium?] [switch]. */
function gridColsFor(columns: { system: boolean; premium: boolean; market: boolean }): string {
	const key = `${columns.system ? "system" : "plain"}-${columns.premium ? "premium" : "basic"}`;
	return GRID_COLS[columns.market ? `${key}-market` : key];
}

interface PromptsListEditorProps {
	prompts: EditablePrompt[];
	onChange: (next: EditablePrompt[]) => void;
	showSystemTags?: boolean;
	/** `_key`s of rows edited since the last save, flagged with an accent rail
	 *  so a change is findable in a list of up to {@link MAX_PROMPTS} rows. */
	changedKeys?: ReadonlySet<string>;
	/** Omit to hide the premium column — self-hosted, or a plan with no pool. */
	premium?: PremiumAllowance;
	/** Lets a prompt gain variants. Off where prompts are only being drafted, like onboarding. */
	variants?: boolean;
	markets?: PromptMarkets;
	leading?: ReactNode;
	pendingRows?: number;
}

function useBulkPaste(filledValues: string[], onAdd: (values: string[]) => void) {
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkText, setBulkText] = useState("");

	const bulkPreview = useMemo(
		() => parseBulkPrompts(bulkText, { existing: filledValues, limit: MAX_PROMPTS }),
		[bulkText, filledValues],
	);

	// Over capacity blocks the whole paste rather than quietly taking the lines
	// that fit, so nobody submits a list believing all of it landed.
	const overCapacity = bulkPreview.skipped.overCapacity.length;
	const closeBulk = () => {
		setBulkOpen(false);
		setBulkText("");
	};

	return {
		bulkOpen,
		setBulkOpen,
		bulkText,
		setBulkText,
		bulkPreview,
		bulkNotice: bulkText.trim().length > 0 ? describeSkipped(bulkPreview.skipped) : null,
		bulkError:
			overCapacity > 0
				? `This paste is ${overCapacity} prompt${overCapacity === 1 ? "" : "s"} over the ${MAX_PROMPTS} limit. Remove ${overCapacity === 1 ? "a line" : "some lines"} to continue.`
				: null,
		closeBulk,
		addBulk: () => {
			if (bulkPreview.added.length === 0 || overCapacity > 0) return;
			onAdd(bulkPreview.added);
			closeBulk();
		},
	};
}

/** Counted against the current prompts, so keys from regenerated suggestions don't linger. */
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
	premium,
	showMarket,
	allSelected,
	onToggleSelectAll,
	disabled,
}: {
	gridCols: string;
	showSystemTags: boolean;
	premium?: PremiumAllowance;
	showMarket: boolean;
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
			<div className="flex items-center gap-1 min-w-0">
				Tags
				<Tooltip>
					<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
					<TooltipContent>
						<p className="max-w-xs">Custom labels to organize and filter prompts.</p>
					</TooltipContent>
				</Tooltip>
			</div>
			{showMarket && (
				<div className="flex items-center gap-1">
					Market
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent>
							<p className="max-w-xs">
								The country a prompt is asked from and the language it is written in. Default follows the brand's
								market; anything else is set on this prompt alone. Changing it does not translate the text.
							</p>
						</TooltipContent>
					</Tooltip>
				</div>
			)}
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

const VARIANT_HELP =
	"Add another wording of this question. A variant is tracked as its own prompt: it runs on every model and counts toward your prompt limit.";

const TRANSLATE_HELP =
	"Translate this prompt for another market. Each translation is added as a variant and tracked as its own prompt.";

const FIELD_ACTION_CLASS =
	"flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground";

const ACTIONS_PADDING = ["", "pr-8", "pr-14", "pr-20"];

function FieldAction({
	label,
	help,
	onClick,
	children,
}: {
	label: string;
	help: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={<button type="button" onClick={onClick} aria-label={label} className={FIELD_ACTION_CLASS} />}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent>
				<p className="max-w-xs">{help}</p>
			</TooltipContent>
		</Tooltip>
	);
}

function DraftMarker({ prompt }: { prompt: EditablePrompt }) {
	if (!prompt.suggested && !prompt.translated) return null;
	const Icon = prompt.translated ? Languages : Sparkles;
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="absolute inset-y-0 left-2.5 flex items-center text-primary">
						<Icon className="size-3.5" aria-label={prompt.translated ? "Translated" : "Suggested"} />
					</span>
				}
			/>
			<TooltipContent>
				{prompt.translated
					? "Translated. Check the wording, then save to start tracking it, or remove it."
					: "Suggested. Save to start tracking it, or remove it."}
			</TooltipContent>
		</Tooltip>
	);
}

function PromptTextField({
	prompt,
	lead,
	onValueChange,
	onRemove,
	onAddVariant,
	onTranslate,
	className,
}: {
	prompt: EditablePrompt;
	/** The prompt this row is a variant of. */
	lead?: EditablePrompt;
	onValueChange: (value: string) => void;
	onRemove: () => void;
	onAddVariant?: () => void;
	onTranslate?: () => void;
	className?: string;
}) {
	const removable = !prompt.id;
	const actions = Number(removable) + Number(Boolean(onAddVariant)) + Number(Boolean(onTranslate));
	const marked = prompt.suggested || prompt.translated;
	return (
		<div className={cn("flex items-center gap-1.5", lead && "pl-4", className)}>
			{lead && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
			<div className="relative min-w-0 flex-1">
				<DraftMarker prompt={prompt} />
				<Input
					value={prompt.value}
					onChange={(e) => onValueChange(e.target.value)}
					placeholder={lead ? "Another wording of this question..." : "Enter prompt text..."}
					aria-label={lead ? `Variant of "${lead.value}"` : undefined}
					className={cn("min-w-0", marked && "pl-8", ACTIONS_PADDING[actions])}
				/>
				<div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
					{onAddVariant && (
						<FieldAction label={`Add a variant of "${prompt.value}"`} help={VARIANT_HELP} onClick={onAddVariant}>
							<CopyPlus className="size-3.5" />
						</FieldAction>
					)}
					{onTranslate && (
						<FieldAction label={`Translate "${prompt.value}"`} help={TRANSLATE_HELP} onClick={onTranslate}>
							<Languages className="size-3.5" />
						</FieldAction>
					)}
					{removable && (
						<button
							type="button"
							onClick={onRemove}
							aria-label={prompt.value ? `Remove "${prompt.value}"` : "Remove prompt"}
							className={FIELD_ACTION_CLASS}
						>
							<X className="size-3.5" />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

/** A prompt that sets either half of its market shows the whole of what it resolves to. */
function ownMarket(prompt: EditablePrompt, brandMarket: Market): Market | null {
	if (prompt.country === null && prompt.language === null) return null;
	return resolveMarket(prompt, brandMarket);
}

function PromptMarketField({
	prompt,
	support,
	onChange,
	compact,
}: {
	prompt: EditablePrompt;
	support: MarketSupport;
	onChange: (patch: Pick<EditablePrompt, "country" | "language">) => void;
	compact?: boolean;
}) {
	return (
		<MarketPicker
			value={ownMarket(prompt, support.brandMarket)}
			onChange={(market) => onChange({ country: market?.country ?? null, language: market?.language ?? null })}
			support={support}
			allowDefault
			compact={compact}
			disabled={!prompt.enabled}
		/>
	);
}

const PENDING_WIDTHS = ["70%", "52%", "63%", "46%", "58%"];

function PendingRows({ count, gridCols }: { count: number; gridCols: string }) {
	return (
		<>
			{PENDING_WIDTHS.slice(0, count).map((width) => (
				<div key={width} aria-hidden className={`grid grid-cols-1 ${gridCols} gap-2 items-center py-2`}>
					<Skeleton className="hidden md:block mx-auto size-4 rounded-[4px]" />
					<Skeleton className="h-4" style={{ width }} />
				</div>
			))}
		</>
	);
}

function PromptRow({
	prompt,
	index,
	total,
	update,
	remove,
	allTagOptions,
	showSystemTags,
	changedKeys,
	premium,
	premiumAtCapacity,
	gridCols,
	selected,
	onToggleSelect,
	lead,
	onAddVariant,
	onTranslate,
	support,
}: {
	prompt: EditablePrompt;
	index: number;
	total: number;
	update: (index: number, patch: Partial<EditablePrompt>) => void;
	remove: (index: number) => void;
	allTagOptions: { value: string }[];
	showSystemTags: boolean;
	changedKeys?: ReadonlySet<string>;
	premium?: PremiumAllowance;
	premiumAtCapacity: boolean;
	gridCols: string;
	selected: boolean;
	onToggleSelect: () => void;
	lead?: EditablePrompt;
	onAddVariant?: () => void;
	onTranslate?: () => void;
	support?: MarketSupport;
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
			<div className={`md:hidden flex flex-col gap-2 pb-3 ${index < total - 1 ? "border-b" : ""}`}>
				<div className="flex items-start gap-2">
					<PromptTextField
						prompt={prompt}
						lead={lead}
						onValueChange={(value) => update(index, { value })}
						onRemove={() => remove(index)}
						onAddVariant={onAddVariant}
						onTranslate={onTranslate}
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
				<TagsInput
					value={prompt.tags}
					onValueChange={(tags) => update(index, { tags })}
					options={allTagOptions}
					placeholder="Add tag..."
					searchPlaceholder="Search or create tag..."
					normalizeValue={(raw) => raw.toLowerCase().trim()}
				/>
				{support && <PromptMarketField prompt={prompt} support={support} onChange={(patch) => update(index, patch)} />}
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

			<div className={`hidden md:grid ${gridCols} gap-2 items-start`}>
				<div className="flex justify-center pt-2">
					<Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select prompt" />
				</div>
				<PromptTextField
					prompt={prompt}
					lead={lead}
					onValueChange={(value) => update(index, { value })}
					onRemove={() => remove(index)}
					onAddVariant={onAddVariant}
					onTranslate={onTranslate}
				/>
				{showSystemTags && <TagsInput value={prompt.systemTags} onValueChange={() => {}} disabled placeholder="—" />}
				<TagsInput
					value={prompt.tags}
					onValueChange={(tags) => update(index, { tags })}
					options={allTagOptions}
					placeholder="Add tag..."
					searchPlaceholder="Search or create tag..."
					normalizeValue={(raw) => raw.toLowerCase().trim()}
				/>
				{support && (
					<div className="pt-0.5">
						<PromptMarketField prompt={prompt} support={support} onChange={(patch) => update(index, patch)} compact />
					</div>
				)}
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

function BulkPasteBox({ bulk }: { bulk: ReturnType<typeof useBulkPaste> }) {
	return (
		<div className="space-y-2 rounded-md border bg-muted/40 p-3">
			<Textarea
				value={bulk.bulkText}
				onChange={(e) => bulk.setBulkText(e.target.value)}
				placeholder="One prompt per line"
				rows={6}
				aria-label="Prompts to add, one per line"
			/>
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

function AddControls({
	atCapacity,
	canAddRow,
	onAdd,
	bulk,
}: {
	atCapacity: boolean;
	canAddRow: boolean;
	onAdd: () => void;
	bulk: ReturnType<typeof useBulkPaste>;
}) {
	if (atCapacity) {
		return (
			<p className="text-xs text-muted-foreground">
				Maximum of {MAX_PROMPTS} prompts allowed. Remove a prompt to add a new one.
			</p>
		);
	}
	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				{canAddRow && (
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={onAdd}
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
			{bulk.bulkOpen && <BulkPasteBox bulk={bulk} />}
		</>
	);
}

function SelectionBar({
	count,
	onSetEnabled,
	onTranslate,
	onClear,
}: {
	count: number;
	onSetEnabled: (enabled: boolean) => void;
	onTranslate?: () => void;
	onClear: () => void;
}) {
	return (
		<div className="hidden md:flex flex-wrap items-center justify-between gap-x-2 gap-y-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
			<span className="text-muted-foreground">
				<strong className="text-foreground">{count}</strong> selected
			</span>
			<div className="flex items-center gap-2">
				<Button type="button" size="sm" variant="outline" onClick={() => onSetEnabled(true)} className="cursor-pointer">
					Enable
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => onSetEnabled(false)}
					className="cursor-pointer"
				>
					Disable
				</Button>
				{onTranslate && (
					<Button type="button" size="sm" variant="outline" onClick={onTranslate} className="cursor-pointer">
						<Languages className="size-3.5" /> Translate
					</Button>
				)}
				<Button type="button" size="sm" variant="ghost" onClick={onClear} className="cursor-pointer">
					Clear
				</Button>
			</div>
		</div>
	);
}

function PromptCount({ prompts }: { prompts: EditablePrompt[] }) {
	const tracked = prompts.filter((p) => p.enabled && p.value.trim().length > 0);
	const variantCount = countVariants(tracked);
	return (
		<p className="text-xs text-muted-foreground">
			<strong>
				{tracked.length}/{MAX_PROMPTS}
			</strong>{" "}
			prompts configured
			{variantCount > 0 &&
				`, including ${variantCount} ${variantCount === 1 ? "variant" : "variants"}. Each variant is tracked as its own prompt.`}
		</p>
	);
}

function MarketsNote({ support }: { support: MarketSupport }) {
	const params = useBrandParams();
	return (
		<div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
			<p>
				Prompts are asked in <span className="font-medium">{marketName(support.brandMarket)}</span> unless a prompt sets
				its own market.{" "}
				<Link to="/app/org/$org/brand/$brand/settings/brand" params={params} className="underline">
					Change the default
				</Link>
			</p>
			<MarketCostNote support={support} country={support.brandMarket.country} className="mt-1" />
			<p className="mt-1 text-xs text-muted-foreground">
				Every variant and every translation is another prompt, tracked and paid for on its own.
			</p>
		</div>
	);
}

function toDraftRow(draft: TranslatedDraft, lead: EditablePrompt | undefined): EditablePrompt {
	return newPromptEntry({
		groupId: draft.source.groupId,
		value: draft.value,
		tags: lead?.tags ?? [],
		country: draft.market.country,
		language: draft.market.language,
		translated: true,
	});
}

export function PromptsListEditor({
	prompts,
	onChange,
	showSystemTags = true,
	changedKeys,
	premium,
	variants = false,
	markets,
	leading,
	pendingRows = 0,
}: PromptsListEditorProps) {
	// The sources outlive `open`, so the dialog still names them while it animates shut.
	const [translation, setTranslation] = useState<{ open: boolean; sources: EditablePrompt[] }>({
		open: false,
		sources: [],
	});
	const translate = (sources: EditablePrompt[]) => setTranslation({ open: true, sources });
	const allTagOptions = useMemo(() => {
		const set = new Set<string>();
		for (const p of prompts) for (const t of p.tags) set.add(t);
		return [...set].sort().map((t) => ({ value: t }));
	}, [prompts]);

	const update = (index: number, patch: Partial<EditablePrompt>) => {
		onChange(prompts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
	};
	const remove = (index: number) => onChange(prompts.filter((_, i) => i !== index));
	const add = () => {
		if (prompts.length >= MAX_PROMPTS) return;
		onChange([...prompts, newPromptEntry()]);
	};

	// A row only takes a slot once it has text. Blank rows are how this editor
	// stages a new prompt and they're dropped on save, so counting them against
	// the cap would refuse prompts the list still has room for.
	const filledValues = useMemo(() => prompts.map((p) => p.value).filter((v) => v.trim().length > 0), [prompts]);
	const atCapacity = filledValues.length >= MAX_PROMPTS;

	const bulk = useBulkPaste(filledValues, (added) =>
		onChange([...prompts, ...added.map((value) => newPromptEntry({ value }))]),
	);

	const { selectedKeys, liveSelectedCount, allSelected, toggleSelect, toggleSelectAll, clearSelection } =
		useRowSelection(prompts);

	const applyEnabledToSelection = (enabled: boolean) => {
		if (liveSelectedCount === 0) return;
		onChange(prompts.map((p) => (selectedKeys.has(p._key) ? { ...p, enabled } : p)));
	};

	const leads = useMemo(() => groupLeads(prompts), [prompts]);
	const addVariant = (lead: EditablePrompt) =>
		onChange(
			insertIntoGroup(
				prompts,
				newPromptEntry({ groupId: lead.groupId, tags: lead.tags, country: lead.country, language: lead.language }),
			),
		);
	const addTranslations = (drafts: TranslatedDraft[]) =>
		onChange(
			drafts.reduce(
				(rows, draft) => insertIntoGroup(rows, toDraftRow(draft, leads.get(draft.source.groupId))),
				prompts,
			),
		);
	const translatable = (rows: EditablePrompt[]) => rows.filter((row) => row.value.trim().length > 0);
	const leadOf = (prompt: EditablePrompt) => {
		const lead = leads.get(prompt.groupId);
		return lead === prompt ? undefined : lead;
	};
	/** A blank row has nothing to reword or translate yet, and a full list has no room for the result. */
	const canGrow = (prompt: EditablePrompt) => !atCapacity && prompt.value.trim().length > 0;

	// Live pool usage: other brands' assignments plus whatever is ticked here,
	// so the cap applies before a save rather than being rejected by the server.
	const premiumUsed = premium ? premium.assignedElsewhere + premiumSlotsUsed(prompts) : 0;
	const premiumAtCapacity = premium ? premiumUsed >= premium.total : false;

	const gridCols = gridColsFor({ system: showSystemTags, premium: Boolean(premium), market: Boolean(markets) });

	return (
		<div className="space-y-4">
			{liveSelectedCount > 0 && (
				<SelectionBar
					count={liveSelectedCount}
					onSetEnabled={applyEnabledToSelection}
					onTranslate={
						markets && !atCapacity
							? () => translate(translatable(prompts.filter((p) => selectedKeys.has(p._key))))
							: undefined
					}
					onClear={clearSelection}
				/>
			)}

			{markets && <MarketsNote support={markets.support} />}

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
				premium={premium}
				showMarket={Boolean(markets)}
				allSelected={allSelected}
				onToggleSelectAll={toggleSelectAll}
				disabled={prompts.length === 0}
			/>

			{leading}

			{pendingRows > 0 && <PendingRows count={pendingRows} gridCols={gridCols} />}

			{prompts.length === 0 && pendingRows === 0 ? (
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
							remove={remove}
							allTagOptions={allTagOptions}
							showSystemTags={showSystemTags}
							changedKeys={changedKeys}
							premium={premium}
							premiumAtCapacity={premiumAtCapacity}
							gridCols={gridCols}
							selected={selectedKeys.has(prompt._key)}
							onToggleSelect={() => toggleSelect(prompt._key)}
							lead={leadOf(prompt)}
							onAddVariant={canGrow(prompt) && variants && !leadOf(prompt) ? () => addVariant(prompt) : undefined}
							onTranslate={canGrow(prompt) && markets ? () => translate([prompt]) : undefined}
							support={markets?.support}
						/>
					))}
				</div>
			)}

			<AddControls atCapacity={atCapacity} canAddRow={prompts.length < MAX_PROMPTS} onAdd={add} bulk={bulk} />

			<PromptCount prompts={prompts} />

			{markets && (
				<TranslatePromptsDialog
					open={translation.open && translation.sources.length > 0}
					onOpenChange={(open) => setTranslation((current) => ({ ...current, open }))}
					sources={translation.sources}
					existing={prompts}
					support={markets.support}
					room={MAX_PROMPTS - filledValues.length}
					translate={markets.translate}
					onTranslated={addTranslations}
				/>
			)}
		</div>
	);
}
