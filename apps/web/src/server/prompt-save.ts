/**
 * What a prompts save will write, decided before anything touches the database.
 *
 * Pure, so the two rules that are easy to get wrong — which submitted rows a
 * brand may claim, and what grounded models a row ends up carrying — can be
 * stated in tests rather than inferred from the handler around them.
 */

import { selectPremiumModels } from "@workspace/config/plans";

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
 * What a row will hold once written. Structurally a `PromptPoolState`, so the
 * plan can be handed straight to `promptSaveDelta` — but mutable, because these
 * are the values the insert and update statements carry.
 */
export interface PlannedState {
	enabled: boolean;
	premiumModels: string[];
}

export interface PlannedUpdate {
	/** The stored row this write lands on. */
	id: string;
	prompt: SubmittedPrompt;
	before: StoredPrompt;
	after: PlannedState;
}

export interface PlannedInsert {
	prompt: SubmittedPrompt;
	after: PlannedState;
}

/** Both lists carry `before`/`after`, so the whole plan can be priced at once. */
export interface PromptSavePlan {
	updates: PlannedUpdate[];
	inserts: PlannedInsert[];
}

export function planPromptSave(
	submitted: readonly SubmittedPrompt[],
	existing: readonly StoredPrompt[],
	{ premiumMetered }: { premiumMetered: boolean },
): PromptSavePlan {
	const existingById = new Map(existing.map((row) => [row.id, row]));

	// Grounded models are metered per prompt/model pairing from a cloud pool.
	// Where there is none the run policy never reads the column, so the field is
	// not the editor's to set: each row keeps whatever it already stores and a new
	// row carries none. Refusing the save instead would freeze any database moved
	// off cloud, which submits its stored assignments on every save.
	const premiumModelsFor = (prompt: SubmittedPrompt, before?: StoredPrompt) =>
		premiumMetered ? selectPremiumModels(prompt.premiumModels) : (before?.premiumModels ?? []);

	// The editor submits the brand's whole list, so every row either updates one
	// of the brand's own prompts or adds a new one. Anything else — an id from
	// another brand, or the same id twice — is dropped rather than written, which
	// bounds the save to the brand's own size and stops a padded list from
	// inflating the pools it is charged for.
	const claimed = new Set<string>();
	const updates: PlannedUpdate[] = [];
	const inserts: PlannedInsert[] = [];

	for (const prompt of submitted) {
		if (prompt.id === undefined) {
			inserts.push({ prompt, after: { enabled: prompt.enabled, premiumModels: premiumModelsFor(prompt) } });
			continue;
		}
		const before = existingById.get(prompt.id);
		if (!before || claimed.has(prompt.id)) continue;
		claimed.add(prompt.id);
		updates.push({
			id: prompt.id,
			prompt,
			before,
			after: { enabled: prompt.enabled, premiumModels: premiumModelsFor(prompt, before) },
		});
	}

	return { updates, inserts };
}
