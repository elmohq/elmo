import { selectPremiumModels } from "@workspace/config/plans";
import type { PromptSaveRow } from "@workspace/lib/entitlements";

export interface SubmittedPrompt {
	id?: string;
	value: string;
	enabled: boolean;
	tags?: string[];
	premiumModels?: string[];
}

export interface StoredPrompt {
	id: string;
	enabled: boolean;
	premiumModels: string[];
}

export interface PlannedState {
	enabled: boolean;
	premiumModels: string[];
}

export interface PlannedUpdate extends PromptSaveRow {
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

	// Skip ids the brand does not own, and the same id twice. Otherwise a padded
	// list would be charged to the org's pools more than once.
	const claimed = new Set<string>();
	const updates: PlannedUpdate[] = [];
	const inserts: PlannedInsert[] = [];

	for (const prompt of submitted) {
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
