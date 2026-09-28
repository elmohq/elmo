/**
 * The settings/prompts page for a catalog that can hold ten thousand rows.
 *
 * The browser only ever holds one page of fifty rows: the route loader asks
 * Postgres for the page the URL names (`page`, `q`, `tag`, `status`), this
 * component edits those rows in place, and Save sends back just the rows that
 * changed. Filters and paging are URL state, so a filtered page is a link and
 * the router's blocker guards edits against every way of leaving it.
 */

import { useNavigate, useRouter } from "@tanstack/react-router";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Inbox, Plus, Search, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { PromptImportPanel } from "@/components/prompt-import";
import {
	type EditablePrompt,
	newPromptEntry,
	type PremiumAllowance,
	PromptsListEditor,
} from "@/components/prompts-list-editor";
import { UnsavedChangesBar } from "@/components/unsaved-changes-bar";
import { useInvalidatePromptsSummary } from "@/hooks/use-prompts-summary";
import { trackEvent } from "@/lib/posthog";
import type { PromptCatalogQuery, PromptStatusFilter } from "@/lib/prompt-catalog";
import { PROMPT_SAVE_FAILED } from "@/lib/public-errors";
import { useWriteErrorMessage } from "@/lib/write-errors";
import type { PromptCatalogPage } from "@/server/prompt-catalog-load";
import { updatePromptsFn } from "@/server/prompts";

const STATUS_LABELS: Record<PromptStatusFilter, string> = {
	all: "All statuses",
	enabled: "Enabled",
	disabled: "Disabled",
};

const ALL_TAGS = "__all__";

function formatCount(n: number): string {
	return n.toLocaleString("en-US");
}

/** Same ordering the loader asks Postgres for, so a page keeps its order while it is edited. */
function toEditablePrompts(rows: PromptCatalogPage["rows"]): EditablePrompt[] {
	return rows.map((p) => ({
		id: p.id,
		_key: p.id,
		value: p.value,
		enabled: p.enabled,
		tags: p.tags ?? [],
		systemTags: p.systemTags ?? [],
		premiumModels: p.premiumModels ?? [],
	}));
}

function sameSet(a: string[], b: string[]): boolean {
	return a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
}

interface PromptCatalogProps {
	brandId: string;
	page: PromptCatalogPage;
	search: PromptCatalogQuery;
	premium?: PremiumAllowance;
}

export function PromptCatalog({ brandId, page, search, premium }: PromptCatalogProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const invalidatePromptsSummary = useInvalidatePromptsSummary();
	const writeError = useWriteErrorMessage();

	const [baseline, setBaseline] = useState<EditablePrompt[]>(() => toEditablePrompts(page.rows));
	const [rows, setRows] = useState<EditablePrompt[]>(baseline);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const saveInProgress = useRef(false);

	// Fresh loader data — another page, a filter, a reload after a save —
	// replaces what is being edited. The blocker has already made sure nothing
	// unsaved is lost by a navigation; a refresh that lands while rows are
	// being edited (the re-read after a save, finishing under load) must not
	// wipe those edits, so it is skipped and the next clean refresh applies.
	const dirtyRef = useRef(false);
	useEffect(() => {
		if (dirtyRef.current) return;
		const next = toEditablePrompts(page.rows);
		setBaseline(next);
		setRows(next);
		setError(null);
	}, [page]);

	const { changedKeys, addedCount, editedCount, removedCount } = useMemo(() => {
		const before = new Map(baseline.map((p) => [p.id, p]));
		const changed = new Set<string>();
		let added = 0;
		let edited = 0;
		let removed = 0;
		for (const p of rows) {
			const prev = p.id ? before.get(p.id) : undefined;
			if (!prev) {
				if (p.value.trim()) {
					changed.add(p._key);
					added++;
				}
				continue;
			}
			// Clearing the text drops the prompt on save (it is disabled and keeps
			// its text), so it counts as removed rather than edited.
			if (!p.value.trim()) {
				changed.add(p._key);
				removed++;
				continue;
			}
			if (
				p.value.trim() !== prev.value.trim() ||
				p.enabled !== prev.enabled ||
				!sameSet(p.premiumModels, prev.premiumModels) ||
				!sameSet(p.tags, prev.tags)
			) {
				changed.add(p._key);
				edited++;
			}
		}
		return { changedKeys: changed, addedCount: added, editedCount: edited, removedCount: removed };
	}, [rows, baseline]);

	const isDirty = changedKeys.size > 0;
	dirtyRef.current = isDirty;
	const summary = [
		addedCount && `${addedCount} added`,
		editedCount && `${editedCount} edited`,
		removedCount && `${removedCount} removed`,
	]
		.filter(Boolean)
		.join(" · ");

	/** Persist the changed rows. Resolves to whether the save went through. */
	const save = async (): Promise<boolean> => {
		if (saveInProgress.current) return false;
		saveInProgress.current = true;
		setIsSaving(true);
		setError(null);
		try {
			const before = new Map(baseline.map((p) => [p.id, p]));
			const payload = rows
				.filter((p) => changedKeys.has(p._key))
				.map((p) => {
					const prev = p.id ? before.get(p.id) : undefined;
					if (prev && !p.value.trim()) {
						return { id: prev.id, value: prev.value, enabled: false, tags: prev.tags, premiumModels: [] };
					}
					return {
						...(p.id ? { id: p.id } : {}),
						value: p.value.trim(),
						enabled: p.enabled,
						tags: p.tags,
						premiumModels: p.premiumModels,
					};
				});
			const saved = await updatePromptsFn({ data: { brandId, prompts: payload } });
			trackEvent("prompts_updated", { added: addedCount, edited: editedCount, deleted: removedCount });
			invalidatePromptsSummary(brandId);

			// Adopt the server's ids for the rows this save inserted before the page
			// is re-read: a second save in that window must update them, not
			// insert them again.
			const insertedByValue = new Map(saved.filter((p) => !before.has(p.id)).map((p) => [p.value, p]));
			const settled = rows
				.filter((p) => p.value.trim())
				.map((p) => {
					if (p.id) return p;
					const inserted = insertedByValue.get(p.value.trim());
					return inserted ? { ...p, id: inserted.id, systemTags: inserted.systemTags ?? [] } : p;
				});
			setBaseline(settled);
			setRows(settled);
			// The page is then re-read rather than patched: an edited text can move
			// a row to another page, and the counts and tag list changed too.
			await router.invalidate();
			return true;
		} catch (err) {
			console.error("Error saving prompts:", err);
			setError(writeError(err, PROMPT_SAVE_FAILED));
			return false;
		} finally {
			setIsSaving(false);
			saveInProgress.current = false;
		}
	};

	const discard = () => {
		setRows(baseline);
		setError(null);
	};

	const setSearch = (patch: Partial<PromptCatalogQuery>, options: { keepPage?: boolean } = {}) => {
		const next = { ...search, ...(options.keepPage ? {} : { page: 1 }), ...patch };
		navigate({
			to: ".",
			search: (prev: Record<string, unknown>) => ({
				...prev,
				page: next.page > 1 ? next.page : undefined,
				q: next.q || undefined,
				tag: next.tag || undefined,
				status: next.status !== "all" ? next.status : undefined,
			}),
			resetScroll: !options.keepPage,
		});
	};

	const roomLeft = MAX_PROMPTS - page.brand.total - addedCount;
	const addRow = () => {
		if (roomLeft <= 0) return;
		setRows([newPromptEntry(), ...rows]);
	};

	const tagOptions = useMemo(() => {
		const set = new Set(page.tagOptions);
		for (const p of rows) for (const t of p.tags) set.add(t);
		return [...set].sort();
	}, [page.tagOptions, rows]);

	const isFiltered = Boolean(search.q || search.tag || search.status !== "all");
	const rangeStart = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
	const rangeEnd = Math.min(page.page * page.pageSize, page.total);

	return (
		<div className="space-y-4">
			<CatalogToolbar
				search={search}
				tagOptions={tagOptions}
				onChange={setSearch}
				onClear={() => setSearch({ q: "", tag: "", status: "all" })}
				isFiltered={isFiltered}
			/>

			<div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
				<p data-testid="catalog-range">
					{page.total === 0 ? (
						isFiltered ? (
							"No prompts match these filters."
						) : (
							"No prompts yet."
						)
					) : (
						<>
							Showing {formatCount(rangeStart)}–{formatCount(rangeEnd)} of {formatCount(page.total)}
							{isFiltered ? " matching" : ""} prompts
						</>
					)}
				</p>
				<p data-testid="catalog-capacity">
					<strong className="text-foreground">
						{formatCount(page.brand.total)}/{formatCount(MAX_PROMPTS)}
					</strong>{" "}
					prompts in this brand · {formatCount(page.brand.enabled)} enabled
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					type="button"
					onClick={addRow}
					disabled={roomLeft <= 0}
					className="flex items-center gap-2 cursor-pointer"
				>
					<Plus className="h-4 w-4" /> Add Prompt
				</Button>
				<PromptImportPanel
					brandId={brandId}
					blockedReason={isDirty ? "Save or discard the edits on this page before importing." : undefined}
					onImported={() => {
						invalidatePromptsSummary(brandId);
						router.invalidate();
					}}
				/>
			</div>
			{roomLeft <= 0 && (
				<p className="text-xs text-muted-foreground">
					Maximum of {formatCount(MAX_PROMPTS)} prompts reached. Remove a prompt to add a new one.
				</p>
			)}

			{rows.length === 0 ? (
				<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
					<div className="text-center py-8 text-muted-foreground">
						<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p>{isFiltered ? "No prompts match these filters." : "No prompts yet."}</p>
					</div>
				</div>
			) : (
				<PromptsListEditor
					prompts={rows}
					onChange={setRows}
					changedKeys={changedKeys}
					premium={premium}
					addControls={false}
					tagOptions={tagOptions}
				/>
			)}

			<CatalogPager
				page={page.page}
				totalPages={page.totalPages}
				onPage={(p) => setSearch({ page: p }, { keepPage: true })}
			/>

			<UnsavedChangesBar
				isDirty={isDirty}
				isSaving={isSaving}
				summary={summary || undefined}
				error={error}
				onSave={save}
				onDiscard={discard}
				onSaveAndLeave={save}
			/>
		</div>
	);
}

function CatalogToolbar({
	search,
	tagOptions,
	onChange,
	onClear,
	isFiltered,
}: {
	search: PromptCatalogQuery;
	tagOptions: string[];
	onChange: (patch: Partial<PromptCatalogQuery>) => void;
	onClear: () => void;
	isFiltered: boolean;
}) {
	const [q, setQ] = useState(search.q);
	useEffect(() => setQ(search.q), [search.q]);
	const searchId = useId();

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (q.trim() !== search.q) onChange({ q: q.trim() });
	};

	// The active tag stays selectable even when it is outside the first fifty
	// suggestions, so a shared link never shows an empty filter.
	const tags = search.tag && !tagOptions.includes(search.tag) ? [search.tag, ...tagOptions] : tagOptions;

	return (
		<form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-label="Filter prompts">
			<div className="relative">
				<label htmlFor={searchId} className="sr-only">
					Search prompt text
				</label>
				<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					id={searchId}
					value={q}
					onChange={(e) => setQ(e.target.value)}
					onBlur={() => {
						if (q.trim() !== search.q) onChange({ q: q.trim() });
					}}
					placeholder="Search prompts…"
					className="h-8 w-64 pl-8 text-sm"
				/>
			</div>
			<Select
				items={Object.fromEntries([[ALL_TAGS, "All tags"], ...tags.map((t) => [t, t])])}
				value={search.tag || ALL_TAGS}
				onValueChange={(value) => onChange({ tag: value === ALL_TAGS || value === null ? "" : String(value) })}
			>
				<SelectTrigger className="h-8 w-48 text-sm" aria-label="Filter by tag">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL_TAGS}>All tags</SelectItem>
					{tags.map((tag) => (
						<SelectItem key={tag} value={tag}>
							{tag}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				items={STATUS_LABELS}
				value={search.status}
				onValueChange={(value) => onChange({ status: (value ?? "all") as PromptStatusFilter })}
			>
				<SelectTrigger className="h-8 w-40 text-sm" aria-label="Filter by status">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{(Object.keys(STATUS_LABELS) as PromptStatusFilter[]).map((status) => (
						<SelectItem key={status} value={status}>
							{STATUS_LABELS[status]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button type="submit" size="sm" variant="outline" className="h-8 cursor-pointer">
				Search
			</Button>
			{isFiltered && (
				<Button type="button" size="sm" variant="ghost" onClick={onClear} className="h-8 cursor-pointer">
					<X className="mr-1 size-3.5" /> Clear filters
				</Button>
			)}
		</form>
	);
}

function CatalogPager({
	page,
	totalPages,
	onPage,
}: {
	page: number;
	totalPages: number;
	onPage: (page: number) => void;
}) {
	const [jump, setJump] = useState(String(page));
	useEffect(() => setJump(String(page)), [page]);
	const jumpId = useId();
	if (totalPages <= 1) return null;

	const go = (target: number) => {
		const clamped = Math.min(totalPages, Math.max(1, target));
		if (clamped !== page) onPage(clamped);
		else setJump(String(page));
	};

	return (
		<nav aria-label="Catalog pages" className="flex flex-wrap items-center justify-between gap-2 text-sm">
			<span className="text-muted-foreground tabular-nums">
				Page {formatCount(page)} of {formatCount(totalPages)}
			</span>
			<div className="flex items-center gap-1.5">
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={page <= 1}
					onClick={() => go(1)}
					className="cursor-pointer"
				>
					First
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={page <= 1}
					onClick={() => go(page - 1)}
					className="cursor-pointer"
				>
					Previous
				</Button>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						go(Number.parseInt(jump, 10) || page);
					}}
					className="flex items-center gap-1"
				>
					<label htmlFor={jumpId} className="sr-only">
						Go to page
					</label>
					<Input
						id={jumpId}
						inputMode="numeric"
						value={jump}
						onChange={(e) => setJump(e.target.value)}
						className="h-8 w-16 text-center text-sm tabular-nums"
					/>
				</form>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={page >= totalPages}
					onClick={() => go(page + 1)}
					className="cursor-pointer"
				>
					Next
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={page >= totalPages}
					onClick={() => go(totalPages)}
					className="cursor-pointer"
				>
					Last
				</Button>
			</div>
		</nav>
	);
}
