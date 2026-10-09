import { selectPremiumModels } from "@workspace/config/plans";

export interface SubmittedPrompt {
	id?: string;
	value: string;
	enabled: boolean;
	/** Only read for a new prompt; a saved prompt's country never changes. */
	country?: string;
	/** Likewise fixed once saved. */
	language?: string;
	/** Only read for a new prompt; omitted, it starts a group of its own. */
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

/**
 * A write that would put two live prompts of one group in the same market —
 * caught by the database's unique index rather than checked ahead of every
 * write path.
 */
export class PromptMarketTakenError extends Error {
	constructor() {
		super("This prompt is already tracked in that market. Each market can hold one version of a prompt.");
		this.name = "PromptMarketTakenError";
	}
}

/** Rethrows the group-market unique violation as `PromptMarketTakenError`, anything else as is. */
export function rethrowMarketTaken(error: unknown, indexName: string): never {
	const pgError = (error as { cause?: unknown })?.cause ?? error;
	const { code, constraint } = (pgError ?? {}) as { code?: string; constraint?: string };
	if (code === "23505" && constraint === indexName) throw new PromptMarketTakenError();
	throw error;
}
