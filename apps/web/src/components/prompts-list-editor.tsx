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
import { describeSkipped, parseBulkPrompts } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { Inbox, ListPlus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

export interface EditablePrompt {
	id?: string;
	_key: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
}

/**
 * Capacity information is deliberately scoped. Legacy deployments cap the
 * rows managed by this editor, while cloud plans cap enabled prompts across an
 * organization. Keeping those shapes distinct prevents a brand-local count
 * from being presented as organization usage.
 */
export type PromptEditorCapacity =
	| { scope: "editor"; limit: number }
	| { scope: "organization-enabled"; limit: number; usedOutsideEditor: number };

export const DEFAULT_PROMPT_EDITOR_CAPACITY: PromptEditorCapacity = {
	scope: "editor",
	limit: MAX_PROMPTS,
};

export function newPromptEntry(partial?: Partial<EditablePrompt>): EditablePrompt {
	return {
		_key: crypto.randomUUID(),
		value: partial?.value ?? "",
		enabled: partial?.enabled ?? true,
		tags: partial?.tags ?? [],
		systemTags: partial?.systemTags ?? [],
		...(partial?.id ? { id: partial.id } : {}),
	};
}

interface PromptsListEditorProps {
	prompts: EditablePrompt[];
	onChange: (next: EditablePrompt[]) => void;
	/** Show the read-only System Tags column. Default true. */
	showSystemTags?: boolean;
	/** `_key`s of rows edited since the last save, flagged with an accent rail
	 *  so a change is findable in a list of up to {@link MAX_PROMPTS} rows. */
	changedKeys?: ReadonlySet<string>;
	/** Defaults to the legacy per-editor row limit. */
	capacity?: PromptEditorCapacity;
}

export function PromptsListEditor({
	prompts,
	onChange,
	showSystemTags = true,
	changedKeys,
	capacity = DEFAULT_PROMPT_EDITOR_CAPACITY,
}: PromptsListEditorProps) {
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

	const allTagOptions = useMemo(() => {
		const set = new Set<string>();
		for (const p of prompts) for (const t of p.tags) set.add(t);
		return [...set].sort().map((t) => ({ value: t }));
	}, [prompts]);

	const update = (index: number, patch: Partial<EditablePrompt>) => {
		onChange(prompts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
	};
	// Bulk paste. The parse is pure and lives in @workspace/lib so the rules
	// (trim, dedupe, cap) are tested without a DOM, and it runs on every
	// keystroke only to label the button and warn about what will be dropped.
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkText, setBulkText] = useState("");

	// A row only takes a slot once it has text. Blank rows are how this editor
	// stages a new prompt and they're dropped on save, so counting them against
	// the cap would refuse prompts the list still has room for.
	const filledValues = useMemo(() => prompts.map((p) => p.value).filter((v) => v.trim().length > 0), [prompts]);
	const validCount = prompts.filter((p) => p.enabled && p.value.trim().length > 0).length;
	const rowLimit = capacity.scope === "editor" ? capacity.limit : null;
	const enabledLimit = capacity.scope === "organization-enabled" ? capacity.limit : null;
	// Enabled blank rows reserve a cloud slot while they are being edited. This
	// prevents adding a blank row and a bulk paste from both claiming the same
	// last available slot before the server performs its authoritative check.
	const enabledRows = prompts.filter((prompt) => prompt.enabled).length;
	const enabledUsage =
		capacity.scope === "organization-enabled" ? capacity.usedOutsideEditor + enabledRows : validCount;
	const enabledRoom = enabledLimit === null ? Number.MAX_SAFE_INTEGER : Math.max(0, enabledLimit - enabledUsage);
	const atRowCapacity = rowLimit !== null && filledValues.length >= rowLimit;
	const atEnabledCapacity = enabledLimit !== null && enabledUsage >= enabledLimit;

	const add = () => {
		if (rowLimit !== null && prompts.length >= rowLimit) return;
		onChange([...prompts, newPromptEntry({ enabled: !atEnabledCapacity })]);
	};

	const bulkLimit = capacity.scope === "editor" ? capacity.limit : filledValues.length + Math.max(0, enabledRoom);

	const bulkPreview = useMemo(
		() => parseBulkPrompts(bulkText, { existing: filledValues, limit: bulkLimit }),
		[bulkText, filledValues, bulkLimit],
	);
	const bulkNotice = bulkText.trim().length > 0 ? describeSkipped(bulkPreview.skipped) : null;

	// Over capacity blocks the whole paste rather than quietly taking the lines
	// that fit, so nobody submits a list believing all of it landed.
	const overCapacity = bulkPreview.skipped.overCapacity.length;
	const bulkError =
		overCapacity > 0
			? capacity.scope === "organization-enabled"
				? `This paste is ${overCapacity} prompt${overCapacity === 1 ? "" : "s"} over your organization's ${capacity.limit} enabled prompt limit. Remove ${overCapacity === 1 ? "a line" : "some lines"} to continue.`
				: `This paste is ${overCapacity} prompt${overCapacity === 1 ? "" : "s"} over the ${capacity.limit} limit. Remove ${overCapacity === 1 ? "a line" : "some lines"} to continue.`
			: null;

	const closeBulk = () => {
		setBulkOpen(false);
		setBulkText("");
	};
	const addBulk = () => {
		if (bulkPreview.added.length === 0 || overCapacity > 0) return;
		onChange([...prompts, ...bulkPreview.added.map((value) => newPromptEntry({ value }))]);
		closeBulk();
	};

	// Count selection against current prompts so stale keys (e.g. after the
	// wizard regenerates suggestions) don't linger.
	const liveSelectedCount = prompts.reduce((n, p) => (selectedKeys.has(p._key) ? n + 1 : n), 0);
	const allSelected = prompts.length > 0 && liveSelectedCount === prompts.length;

	const toggleSelect = (key: string) => {
		setSelectedKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};
	const toggleSelectAll = () => {
		if (allSelected) setSelectedKeys(new Set());
		else setSelectedKeys(new Set(prompts.map((p) => p._key)));
	};
	const applyEnabledToSelection = (enabled: boolean) => {
		if (liveSelectedCount === 0) return;
		onChange(prompts.map((p) => (selectedKeys.has(p._key) ? { ...p, enabled } : p)));
	};
	const clearSelection = () => setSelectedKeys(new Set());

	const selectedEnableDelta = prompts.reduce(
		(count, prompt) => (selectedKeys.has(prompt._key) && !prompt.enabled ? count + 1 : count),
		0,
	);
	const selectionExceedsEnabledCapacity = enabledLimit !== null && selectedEnableDelta > enabledRoom;

	// Desktop layout only — column order is [select] [text] [system?] [tags] [switch].
	// Mobile renders a stacked per-prompt block instead (no selection, no bulk).
	const gridCols = showSystemTags
		? "md:grid-cols-[2.25rem_minmax(0,1fr)_6rem_minmax(14rem,1fr)_2.75rem]"
		: "md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(14rem,1fr)_2.75rem]";

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
							disabled={selectionExceedsEnabledCapacity}
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

			<div className={`hidden md:grid ${gridCols} gap-2 text-sm font-medium text-muted-foreground border-b pb-2`}>
				<div className="flex justify-center">
					<Checkbox
						checked={allSelected}
						onCheckedChange={toggleSelectAll}
						disabled={prompts.length === 0}
						aria-label={allSelected ? "Deselect all prompts" : "Select all prompts"}
					/>
				</div>
				<div className="flex items-center gap-1 min-w-0">
					Prompt Text
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent>
							<p className="max-w-xs">The question or query that will be sent to AI models for evaluation.</p>
						</TooltipContent>
					</Tooltip>
				</div>
				{showSystemTags && (
					<div className="hidden md:flex items-center gap-1">
						System
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
							</TooltipTrigger>
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
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent>
							<p className="max-w-xs">Custom labels to organize and filter prompts.</p>
						</TooltipContent>
					</Tooltip>
				</div>
				<div className="flex justify-center">
					<span className="sr-only">Enabled</span>
				</div>
			</div>

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
						<div
							key={prompt._key}
							className={cn(
								"-ml-3 border-l-2 pl-3 transition-colors",
								changedKeys?.has(prompt._key) ? "border-amber-500" : "border-transparent",
								!prompt.enabled && "opacity-60",
							)}
						>
							{changedKeys?.has(prompt._key) && <span className="sr-only">Has unsaved changes</span>}
							{/* Mobile: stacked, no selection/bulk */}
							<div className={`md:hidden flex flex-col gap-2 pb-3 ${index < prompts.length - 1 ? "border-b" : ""}`}>
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
											disabled={!prompt.enabled && atEnabledCapacity}
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
							</div>

							{/* Desktop (md+): single-line grid */}
							<div className={`hidden md:grid ${gridCols} gap-2 items-start`}>
								<div className="flex justify-center pt-2">
									<Checkbox
										checked={selectedKeys.has(prompt._key)}
										onCheckedChange={() => toggleSelect(prompt._key)}
										aria-label="Select prompt"
									/>
								</div>
								<Input
									value={prompt.value}
									onChange={(e) => update(index, { value: e.target.value })}
									placeholder="Enter prompt text..."
									className="min-w-0"
								/>
								{showSystemTags && (
									<TagsInput value={prompt.systemTags} onValueChange={() => {}} disabled placeholder="—" />
								)}
								<TagsInput
									value={prompt.tags}
									onValueChange={(tags) => update(index, { tags })}
									options={allTagOptions}
									placeholder="Add tag..."
									searchPlaceholder="Search or create tag..."
									normalizeValue={(raw) => raw.toLowerCase().trim()}
								/>
								<div className="flex justify-center pt-2">
									<Switch
										checked={prompt.enabled}
										onCheckedChange={(checked) => update(index, { enabled: checked })}
										disabled={!prompt.enabled && atEnabledCapacity}
										aria-label={prompt.enabled ? "Disable prompt" : "Enable prompt"}
									/>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{!atRowCapacity && (
				<div className="flex flex-wrap items-center gap-2">
					{(rowLimit === null || prompts.length < rowLimit) && (
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
					{!atEnabledCapacity && (
						<Button
							variant="outline"
							size="sm"
							type="button"
							onClick={() => setBulkOpen((open) => !open)}
							className="flex items-center gap-2 cursor-pointer"
						>
							<ListPlus className="h-4 w-4" /> Add Multiple
						</Button>
					)}
				</div>
			)}

			{bulkOpen && !atRowCapacity && !atEnabledCapacity && (
				<div className="space-y-2 rounded-md border bg-muted/40 p-3">
					<Textarea
						value={bulkText}
						onChange={(e) => setBulkText(e.target.value)}
						placeholder="One prompt per line"
						rows={6}
						aria-label="Prompts to add, one per line"
					/>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							type="button"
							onClick={addBulk}
							disabled={bulkPreview.added.length === 0 || overCapacity > 0}
						>
							Add {bulkPreview.added.length > 0 ? `${bulkPreview.added.length} ` : ""}
							{bulkPreview.added.length === 1 ? "Prompt" : "Prompts"}
						</Button>
						<Button variant="ghost" size="sm" type="button" onClick={closeBulk}>
							Cancel
						</Button>
						{bulkNotice && <span className="text-xs text-muted-foreground">{bulkNotice}</span>}
					</div>
					{bulkError && (
						<p role="alert" className="text-xs text-destructive">
							{bulkError}
						</p>
					)}
				</div>
			)}

			{atRowCapacity && capacity.scope === "editor" && (
				<p className="text-xs text-muted-foreground">
					Maximum of {capacity.limit} prompts allowed. Remove a prompt to add a new one.
				</p>
			)}
			{atEnabledCapacity && capacity.scope === "organization-enabled" && (
				<p className="text-xs text-muted-foreground">
					Your organization&apos;s plan allows {capacity.limit} enabled prompts. Disable a prompt to enable another.
				</p>
			)}

			<p className="text-xs text-muted-foreground">
				<strong>
					{capacity.scope === "organization-enabled"
						? `${enabledUsage}/${capacity.limit}`
						: `${validCount}/${capacity.limit}`}
				</strong>{" "}
				{capacity.scope === "organization-enabled"
					? "enabled prompts used across the organization"
					: "prompts configured"}
			</p>
		</div>
	);
}
