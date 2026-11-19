import { randomUUID } from "node:crypto";
import { selectPremiumModels } from "@workspace/config/plans";
import { variantGroupOf } from "@/lib/prompt-variants";

export interface SubmittedPrompt {
	id?: string;
	value: string;
	enabled: boolean;
	tags?: string[];
	premiumModels?: string[];
	/** Only read on an insert: the saved prompt, or the new prompts saved alongside, it is a variant of. */
	variantOf?: string;
	/** Null follows the brand; omitted, an update keeps what it has. */
	country?: string | null;
	language?: string | null;
}

export interface StoredPrompt {
	id: string;
	enabled: boolean;
	premiumModels: string[];
}

interface PlannedState {
	enabled: boolean;
	premiumModels: string[];
}

interface PlannedUpdate {
	id: string;
	prompt: SubmittedPrompt;
	before: StoredPrompt;
	after: PlannedState;
}

interface PlannedInsert {
	prompt: SubmittedPrompt;
	after: PlannedState;
}

export interface PromptSavePlan {
	updates: PlannedUpdate[];
	inserts: PlannedInsert[];
}

export function planPromptSave(
	submitted: readonly SubmittedPrompt[],
	existing: readonly StoredPrompt[],
): PromptSavePlan {
	const existingById = new Map(existing.map((row) => [row.id, row]));

	const claimed = new Set<string>();
	const updates: PlannedUpdate[] = [];
	const inserts: PlannedInsert[] = [];

	for (const prompt of submitted) {
		const after = { enabled: prompt.enabled, premiumModels: selectPremiumModels(prompt.premiumModels) };
		if (prompt.id === undefined) {
			inserts.push({ prompt, after });
			continue;
		}
		// The editor only ever submits ids it loaded from this brand, so both of
		// these mean the caller and the database disagree about what exists.
		// Guessing which row was meant would write one edit and drop another.
		const before = existingById.get(prompt.id);
		if (!before) {
			throw new Error(`Prompt ${prompt.id} is not in this brand's list. Reload the page and try again.`);
		}
		if (claimed.has(prompt.id)) {
			throw new Error(`Prompt ${prompt.id} appears twice in this save.`);
		}
		claimed.add(prompt.id);
		updates.push({ id: prompt.id, prompt, before, after });
	}

	return { updates, inserts };
}

/**
 * Ids and parents for prompts about to be inserted together. A key naming a saved prompt makes
 * the new one its variant; among new prompts sharing any other key, the first is the parent.
 */
export function parentsForInserts(
	keys: readonly (string | undefined)[],
	saved: ReadonlyMap<string, { id: string; parentId: string | null }>,
): { id: string; parentId: string | null }[] {
	const firstWithKey = new Map<string, string>();
	return keys.map((key) => {
		const id = randomUUID();
		if (!key) return { id, parentId: null };
		const parent = saved.get(key);
		if (parent) return { id, parentId: variantGroupOf(parent) };
		const first = firstWithKey.get(key);
		if (first) return { id, parentId: first };
		firstWithKey.set(key, id);
		return { id, parentId: null };
	});
}
