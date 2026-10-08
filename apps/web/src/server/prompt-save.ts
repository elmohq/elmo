import { countryName } from "@workspace/config/countries";
import { languageName } from "@workspace/config/languages";
import { selectPremiumModels } from "@workspace/config/plans";

export interface SubmittedPrompt {
	id?: string;
	value: string;
	enabled: boolean;
	/** Only read for a new prompt; a saved prompt's country never changes. */
	country?: string;
	/** Likewise fixed once saved. */
	language?: string;
	/** Omitted, a new prompt starts a group of its own and a saved one stays put. */
	groupId?: string;
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

export interface GroupMember {
	value: string;
	enabled: boolean;
	groupId: string;
	country: string;
	language: string;
}

/** Two enabled prompts in one group asking from the same country in the same language. */
export class PromptGroupClashError extends Error {
	constructor(first: GroupMember, second: GroupMember) {
		super(
			`"${first.value}" and "${second.value}" are in the same group for ${countryName(first.country)} in ${languageName(first.language)}. A group holds one prompt per country and language.`,
		);
		this.name = "PromptGroupClashError";
	}
}

/**
 * A group is one question asked across markets, so two enabled members in the
 * same country and language would be the same measurement twice, and the
 * group's per-market view couldn't say which one it shows. Disabled members
 * don't count: they're how removed prompts keep their history.
 */
export function assertOneVariantPerMarket(members: readonly GroupMember[]): void {
	const seen = new Map<string, GroupMember>();
	for (const member of members) {
		if (!member.enabled) continue;
		const key = `${member.groupId}|${member.country}|${member.language}`;
		const clash = seen.get(key);
		if (clash) throw new PromptGroupClashError(clash, member);
		seen.set(key, member);
	}
}
