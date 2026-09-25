import { selectPremiumModels } from "@workspace/config/plans";

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
			throw new Error(`"${promptLabel(prompt)}" is no longer in this brand's prompts. Reload the page and try again.`);
		}
		if (claimed.has(prompt.id)) {
			throw new Error(`"${promptLabel(prompt)}" is listed twice. Reload the page and try again.`);
		}
		claimed.add(prompt.id);
		updates.push({ id: prompt.id, prompt, before, after });
	}

	return { updates, inserts };
}

function promptLabel(prompt: SubmittedPrompt): string {
	const text = prompt.value.trim();
	return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
