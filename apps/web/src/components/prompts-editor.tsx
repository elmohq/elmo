import { useMemo, useRef, useState } from "react";
import { type EditablePrompt, type PremiumAllowance, PromptsListEditor } from "@/components/prompts-list-editor";
import { UnsavedChangesBar } from "@/components/unsaved-changes-bar";
import { useInvalidatePromptsSummary } from "@/hooks/use-prompts-summary";
import { trackEvent } from "@/lib/posthog";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updatePromptsFn } from "@/server/prompts";

interface PromptRow {
	id: string;
	value: string;
	enabled: boolean;
	tags?: string[] | null;
	systemTags?: string[] | null;
	premiumModels?: string[] | null;
}

interface PromptsEditorProps {
	initialPrompts: PromptRow[];
	brandId: string;
	pageTitle: string;
	pageDescription: string;
	premium?: PremiumAllowance;
}

/** Order-insensitive, since the picker appends and the server returns catalog order. */
function sameModels(a: string[], b: string[]): boolean {
	return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** Same ordering the route loader asks Postgres for, so the list a save leaves
 *  behind matches what a reload would show. */
function toEditablePrompts(rows: PromptRow[]): EditablePrompt[] {
	return rows
		.map((p) => ({
			id: p.id,
			_key: p.id,
			value: p.value,
			enabled: p.enabled,
			tags: p.tags || [],
			systemTags: p.systemTags || [],
			premiumModels: p.premiumModels ?? [],
		}))
		.sort(
			(a, b) => a.value.localeCompare(b.value) || Number(b.enabled) - Number(a.enabled) || a.id.localeCompare(b.id),
		);
}

function sameTags(a: string[], b: string[]) {
	if (a.length !== b.length) return false;
	const sortedB = [...b].sort();
	return [...a].sort().every((t, i) => t === sortedB[i]);
}

export function PromptsEditor({ initialPrompts, brandId, pageTitle, pageDescription, premium }: PromptsEditorProps) {
	const [baseline, setBaseline] = useState<EditablePrompt[]>(() => toEditablePrompts(initialPrompts));
	const [prompts, setPrompts] = useState<EditablePrompt[]>(baseline);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const saveInProgress = useRef(false);
	const invalidatePromptsSummary = useInvalidatePromptsSummary();
	const writeError = useWriteErrorMessage();

	const { changedKeys, removedCount, addedCount, editedCount } = useMemo(() => {
		const before = new Map(baseline.map((p) => [p.id, p]));
		const changed = new Set<string>();
		let added = 0;
		let edited = 0;

		for (const p of prompts) {
			const prev = p.id ? before.get(p.id) : undefined;
			if (!prev) {
				// An untouched blank row from "Add Prompt" isn't a change yet.
				if (p.value.trim()) {
					changed.add(p._key);
					added++;
				}
				continue;
			}
			// Clearing the text drops the prompt on save, so it counts as removed
			// rather than edited.
			if (!p.value.trim()) {
				changed.add(p._key);
				continue;
			}
			if (
				p.value.trim() !== prev.value.trim() ||
				p.enabled !== prev.enabled ||
				!sameModels(p.premiumModels, prev.premiumModels) ||
				!sameTags(p.tags, prev.tags)
			) {
				changed.add(p._key);
				edited++;
			}
		}

		const liveIds = new Set(prompts.filter((p) => p.value.trim()).map((p) => p.id));
		return {
			changedKeys: changed,
			addedCount: added,
			editedCount: edited,
			removedCount: baseline.filter((p) => !liveIds.has(p.id)).length,
		};
	}, [prompts, baseline]);

	const isDirty = changedKeys.size > 0 || removedCount > 0;
	const summary = [
		addedCount && `${addedCount} added`,
		editedCount && `${editedCount} edited`,
		removedCount && `${removedCount} removed`,
	]
		.filter(Boolean)
		.join(" · ");

	const savePrompts = async () => {
		if (saveInProgress.current) return;

		saveInProgress.current = true;
		setIsSaving(true);
		setError(null);
		try {
			const validPrompts = prompts.filter((p) => p.value.trim());

			const currentIds = new Set(validPrompts.filter((p) => p.id).map((p) => p.id));
			const removedPrompts = baseline
				.filter((p) => !currentIds.has(p.id))
				.map((p) => ({ id: p.id, value: p.value, enabled: false, tags: p.tags, premiumModels: [] }));

			const allPrompts = [
				...validPrompts.map((p) => ({
					...(p.id ? { id: p.id } : {}),
					value: p.value.trim(),
					enabled: p.enabled,
					tags: p.tags,
					premiumModels: p.premiumModels,
				})),
				...removedPrompts,
			];

			const saved = await updatePromptsFn({ data: { brandId, prompts: allPrompts } });

			trackEvent("prompts_updated", { added: addedCount, edited: editedCount, deleted: removedCount });

			// Adopt the server's rows so newly inserted prompts carry their real
			// ids — re-saving without them would insert duplicates.
			const next = toEditablePrompts(saved);
			setPrompts(next);
			setBaseline(next);
			invalidatePromptsSummary(brandId);
		} catch (err) {
			console.error("Error saving prompts:", err);
			setError(writeError(err, "Failed to save prompts."));
		} finally {
			setIsSaving(false);
			saveInProgress.current = false;
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
					<p className="text-muted-foreground">{pageDescription}</p>
				</div>
			</div>

			<PromptsListEditor prompts={prompts} onChange={setPrompts} changedKeys={changedKeys} premium={premium} />

			<UnsavedChangesBar
				isDirty={isDirty}
				isSaving={isSaving}
				summary={summary || undefined}
				error={error}
				onSave={savePrompts}
				onDiscard={() => {
					setPrompts(baseline);
					setError(null);
				}}
			/>
		</div>
	);
}
