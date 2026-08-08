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
import { parseBulkPrompts } from "@workspace/lib/bulk-prompts";
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
import { getTagsInputLabels } from "@/i18n/ui-labels";
import * as m from "@/paraglide/messages.js";

export interface EditablePrompt {
	id?: string;
	_key: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
}

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
}

export function PromptsListEditor({ prompts, onChange, showSystemTags = true, changedKeys }: PromptsListEditorProps) {
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

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
		onChange([...prompts, newPromptEntry()]);
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
	const atCapacity = filledValues.length >= MAX_PROMPTS;

	const bulkPreview = useMemo(
		() => parseBulkPrompts(bulkText, { existing: filledValues, limit: MAX_PROMPTS }),
		[bulkText, filledValues],
	);
	const bulkNotice = useMemo(() => {
		if (bulkText.trim().length === 0) return null;
		const notices: string[] = [];
		const duplicates = bulkPreview.skipped.duplicateOfExisting.length + bulkPreview.skipped.duplicateInPaste.length;
		if (duplicates > 0) {
			notices.push(
				duplicates === 1
					? m.prompts_skipped_duplicates_one({ count: duplicates })
					: m.prompts_skipped_duplicates_many({ count: duplicates }),
			);
		}
		if (bulkPreview.skipped.blank > 0) {
			notices.push(
				bulkPreview.skipped.blank === 1
					? m.prompts_skipped_blank_one({ count: bulkPreview.skipped.blank })
					: m.prompts_skipped_blank_many({ count: bulkPreview.skipped.blank }),
			);
		}
		return notices.length > 0 ? notices.join(" ") : null;
	}, [bulkPreview.skipped, bulkText]);

	// Over capacity blocks the whole paste rather than quietly taking the lines
	// that fit, so nobody submits a list believing all of it landed.
	const overCapacity = bulkPreview.skipped.overCapacity.length;
	const bulkError =
		overCapacity > 0
			? overCapacity === 1
				? m.prompts_bulk_over_one({ count: overCapacity, max: MAX_PROMPTS })
				: m.prompts_bulk_over_many({ count: overCapacity, max: MAX_PROMPTS })
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

	const validCount = prompts.filter((p) => p.enabled && p.value.trim().length > 0).length;

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
						{m.prompts_selected({ count: liveSelectedCount })}
					</span>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => applyEnabledToSelection(true)}
							className="cursor-pointer"
						>
							{m.prompts_enable()}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => applyEnabledToSelection(false)}
							className="cursor-pointer"
						>
							{m.prompts_disable()}
						</Button>
						<Button type="button" size="sm" variant="ghost" onClick={clearSelection} className="cursor-pointer">
							{m.filter_clear()}
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
						aria-label={allSelected ? m.prompts_deselect_all() : m.prompts_select_all()}
					/>
				</div>
				<div className="flex items-center gap-1 min-w-0">
					{m.prompts_text()}
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent>
							<p className="max-w-xs">{m.prompts_text_tip()}</p>
						</TooltipContent>
					</Tooltip>
				</div>
				{showSystemTags && (
					<div className="hidden md:flex items-center gap-1">
						{m.prompts_system()}
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
							</TooltipTrigger>
							<TooltipContent>
								<p className="max-w-xs">{m.prompts_system_tip()}</p>
							</TooltipContent>
						</Tooltip>
					</div>
				)}
				<div className="flex items-center gap-1 min-w-0">
					{m.filter_tags()}
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent>
							<p className="max-w-xs">{m.prompts_tags_tip()}</p>
						</TooltipContent>
					</Tooltip>
				</div>
				<div className="flex justify-center">
					<span className="sr-only">{m.prompts_enabled()}</span>
				</div>
			</div>

			{prompts.length === 0 ? (
				<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
					<div className="text-center py-8 text-muted-foreground">
						<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p>{m.prompts_none()}</p>
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
							{changedKeys?.has(prompt._key) && <span className="sr-only">{m.prompts_unsaved_row()}</span>}
							{/* Mobile: stacked, no selection/bulk */}
							<div className={`md:hidden flex flex-col gap-2 pb-3 ${index < prompts.length - 1 ? "border-b" : ""}`}>
								<div className="flex items-start gap-2">
									<Input
										value={prompt.value}
										onChange={(e) => update(index, { value: e.target.value })}
										placeholder={m.prompts_enter_text()}
										className="min-w-0 flex-1"
									/>
									<div className="pt-2">
										<Switch
											checked={prompt.enabled}
											onCheckedChange={(checked) => update(index, { enabled: checked })}
											aria-label={prompt.enabled ? m.prompts_disable_one() : m.prompts_enable_one()}
										/>
									</div>
								</div>
								<TagsInput
									value={prompt.tags}
									onValueChange={(tags) => update(index, { tags })}
									options={allTagOptions}
									placeholder={m.prompts_add_tag()}
									searchPlaceholder={m.prompts_search_or_create_tag()}
									emptyText={m.tags_no_results()}
									labels={getTagsInputLabels()}
									normalizeValue={(raw) => raw.toLowerCase().trim()}
								/>
							</div>

							{/* Desktop (md+): single-line grid */}
							<div className={`hidden md:grid ${gridCols} gap-2 items-start`}>
								<div className="flex justify-center pt-2">
									<Checkbox
										checked={selectedKeys.has(prompt._key)}
										onCheckedChange={() => toggleSelect(prompt._key)}
										aria-label={m.prompts_select_one()}
									/>
								</div>
								<Input
									value={prompt.value}
									onChange={(e) => update(index, { value: e.target.value })}
									placeholder={m.prompts_enter_text()}
									className="min-w-0"
								/>
								{showSystemTags && (
									<TagsInput
										value={prompt.systemTags}
										onValueChange={() => {}}
										disabled
										placeholder="—"
										emptyText={m.tags_no_results()}
										labels={getTagsInputLabels()}
									/>
								)}
								<TagsInput
									value={prompt.tags}
									onValueChange={(tags) => update(index, { tags })}
									options={allTagOptions}
									placeholder={m.prompts_add_tag()}
									searchPlaceholder={m.prompts_search_or_create_tag()}
									emptyText={m.tags_no_results()}
									labels={getTagsInputLabels()}
									normalizeValue={(raw) => raw.toLowerCase().trim()}
								/>
								<div className="flex justify-center pt-2">
									<Switch
										checked={prompt.enabled}
										onCheckedChange={(checked) => update(index, { enabled: checked })}
									aria-label={prompt.enabled ? m.prompts_disable_one() : m.prompts_enable_one()}
									/>
								</div>
							</div>
						</div>
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
							<Plus className="h-4 w-4" /> {m.prompts_add_one()}
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={() => setBulkOpen((open) => !open)}
						className="flex items-center gap-2 cursor-pointer"
					>
						<ListPlus className="h-4 w-4" /> {m.prompts_add_multiple()}
					</Button>
				</div>
			)}

			{bulkOpen && !atCapacity && (
				<div className="space-y-2 rounded-md border bg-muted/40 p-3">
					<Textarea
						value={bulkText}
						onChange={(e) => setBulkText(e.target.value)}
						placeholder={m.prompts_one_per_line()}
						rows={6}
						aria-label={m.prompts_to_add_label()}
					/>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							type="button"
							onClick={addBulk}
							disabled={bulkPreview.added.length === 0 || overCapacity > 0}
						>
							{bulkPreview.added.length === 1
								? m.prompts_add_count_one({ count: bulkPreview.added.length })
								: m.prompts_add_count_many({ count: bulkPreview.added.length })}
						</Button>
						<Button variant="ghost" size="sm" type="button" onClick={closeBulk}>
							{m.common_cancel()}
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

			{atCapacity && (
				<p className="text-xs text-muted-foreground">
					{m.prompts_maximum({ max: MAX_PROMPTS })}
				</p>
			)}

			<p className="text-xs text-muted-foreground">
				<strong>{m.prompts_configured({ count: validCount, max: MAX_PROMPTS })}</strong>
			</p>
		</div>
	);
}
