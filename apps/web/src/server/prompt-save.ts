/**
 * What a prompts save will write, decided before anything touches the database.
 *
 * Pure and policy-free: it answers which submitted rows a brand may claim and
 * what each row ends up holding, so both can be stated in tests rather than
 * inferred from the handler around them. Whether the org may afford the result
 * is the entitlement guards' question, asked of the plan this returns.
 */

import { selectPremiumModels } from "@workspace/config/plans";
import type { PromptSaveRow } from "@workspace/lib/entitlements";

/** A row as the prompts editor submits it. */
export interface SubmittedPrompt {
	id?: string;
	value: string;
	enabled: boolean;
	tags?: string[];
	premiumModels?: string[];
}

/** A stored row, in as much detail as planning a save needs. */
export interface StoredPrompt {
	id: string;
	enabled: boolean;
	premiumModels: string[];
}

/**
 * What a row will hold once written. A `PromptPoolState` with the array made
 * mutable, because these are the values the insert and update statements carry.
 */
export interface PlannedState {
	enabled: boolean;
	premiumModels: string[];
}

/** Extends `PromptSaveRow` so the plan can be priced by `promptSaveDelta`. */
export interface PlannedUpdate extends PromptSaveRow {
	/** The stored row this write lands on. */
	id: string;
	prompt: SubmittedPrompt;
	before: StoredPrompt;
	after: PlannedState;
}

export interface PlannedInsert extends PromptSaveRow {
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

	// The editor submits the brand's whole list, so every row either updates one
	// of the brand's own prompts or adds a new one. Anything else — an id from
	// another brand, or the same id twice — is dropped rather than written, which
	// bounds the save to the brand's own size and stops a padded list from
	// inflating the pools it is charged for.
	const claimed = new Set<string>();
	const updates: PlannedUpdate[] = [];
	const inserts: PlannedInsert[] = [];

	for (const prompt of submitted) {
		// A model the premium tier does not sell costs nothing and is not an
		// assignment, so it is normalised away rather than failing the save.
		const after = { enabled: prompt.enabled, premiumModels: selectPremiumModels(prompt.premiumModels) };
		if (prompt.id === undefined) {
			inserts.push({ prompt, after });
			continue;
		}
		const before = existingById.get(prompt.id);
		if (!before || claimed.has(prompt.id)) continue;
		claimed.add(prompt.id);
		updates.push({ id: prompt.id, prompt, before, after });
	}

	return { updates, inserts };
}
