import { MAX_PROMPTS } from "./constants";
import { sanitizeUserTags } from "./user-tags";

/**
 * Why a pasted line did not become a prompt.
 *
 * Reported rather than dropped silently: pasting fifty lines and getting
 * forty-one prompts with no explanation is the case this parser exists to
 * avoid, since the nine that vanished are indistinguishable from a bug.
 */
export interface SkippedLines {
	/** Lines that were empty or whitespace only. */
	blank: number;
	/** Lines matching a prompt already in the list. */
	duplicateOfExisting: string[];
	/** Lines repeated within the pasted text itself. */
	duplicateInPaste: string[];
	/** Lines dropped because the list is capped at `MAX_PROMPTS`. */
	overCapacity: string[];
	/** 1-based line numbers of lines that carry tags but no prompt text. */
	missingPrompt: number[];
}

/** One pasted line: the prompt and the user tags that were written after it. */
export interface BulkPromptRecord {
	value: string;
	tags: string[];
}

export interface BulkPromptParse {
	/** Lines that became prompts, in the order they were pasted. */
	added: BulkPromptRecord[];
	skipped: SkippedLines;
}

export interface ParseBulkPromptsOptions {
	/** Prompt values already in the list, used for duplicate detection. */
	existing?: readonly string[];
	/** Total prompts the list may hold. Defaults to `MAX_PROMPTS`. */
	limit?: number;
}

/**
 * Field separator. Reserved syntax: there is no quoting or escaping, so a
 * literal semicolon cannot appear inside a prompt or a tag.
 */
const FIELD_SEPARATOR = ";";

/**
 * Comparison key for two prompts being "the same" — the one identity every
 * creation path (paste, import, onboarding, API) checks duplicates against.
 *
 * Case and surrounding whitespace are ignored, and runs of internal whitespace
 * collapse to one space, so a line re-pasted from a wrapped document does not
 * arrive as a second distinct prompt. Tags play no part in it.
 */
export function promptIdentityKey(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Split pasted text into prompts, one per line, each optionally followed by
 * semicolon-separated tags: `prompt text;tag1;tag2`.
 *
 * Everything this drops, it names. The caller gets the lines that became
 * prompts and, separately, every line that did not along with the reason, so
 * the screen can tell someone that three of their lines were already in the
 * list rather than leaving them to count.
 *
 * Two prompts are duplicates when their text matches, whatever their tags: a
 * duplicate's tags are dropped with it rather than merged into the prompt that
 * won, since a paste is a request to add prompts, not to edit existing ones.
 *
 * Capacity is measured against the whole list, not the paste: `limit` is the
 * total the list may hold, so a paste of ten lines into a list already holding
 * `limit - 2` prompts contributes two and reports eight as over capacity.
 */
export function parseBulkPrompts(text: string, options: ParseBulkPromptsOptions = {}): BulkPromptParse {
	const { existing = [], limit = MAX_PROMPTS } = options;
	const plan = planPromptImport(text, {
		existingKeys: new Set(existing.map(promptIdentityKey)),
		room: Math.max(0, limit - existing.length),
		sampleLimit: Number.POSITIVE_INFINITY,
	});
	return {
		added: plan.records,
		skipped: {
			blank: plan.summary.blank,
			duplicateOfExisting: plan.summary.samples.duplicateOfExisting,
			duplicateInPaste: plan.summary.samples.duplicateInPaste,
			overCapacity: plan.summary.samples.overCapacity,
			missingPrompt: plan.summary.samples.missingPrompt,
		},
	};
}

/** Most examples of each skip reason an import review carries back. */
export const IMPORT_SAMPLE_LIMIT = 100;

/**
 * What an import will do, in numbers plus a bounded set of examples: the
 * whole picture of a ten-thousand-line paste without sending ten thousand
 * lines back to the screen that already has them.
 */
export interface PromptImportSummary {
	/** Lines in the text, blank ones included. */
	lines: number;
	/** Prompts the import will create. */
	added: number;
	blank: number;
	duplicateOfExisting: number;
	duplicateInPaste: number;
	overCapacity: number;
	missingPrompt: number;
	/** At most `sampleLimit` examples per reason, in line order. */
	samples: {
		duplicateOfExisting: string[];
		duplicateInPaste: string[];
		overCapacity: string[];
		/** 1-based line numbers. */
		missingPrompt: number[];
	};
}

export interface PromptImportPlan {
	/** The prompts to create, in pasted order. */
	records: BulkPromptRecord[];
	summary: PromptImportSummary;
}

export interface PlanPromptImportOptions {
	/** `promptIdentityKey` of every prompt the brand already holds. */
	existingKeys: ReadonlySet<string>;
	/** How many more prompts the brand may hold. */
	room: number;
	/** Examples kept per skip reason. Defaults to IMPORT_SAMPLE_LIMIT. */
	sampleLimit?: number;
}

/**
 * The one set of import rules, applied line by line. `parseBulkPrompts`
 * (the wizard's paste) and the settings import's Review and Commit all run
 * this, so a line lands the same way whichever surface it came through.
 *
 * Duplicates are decided on `promptIdentityKey` alone; a duplicate's tags are
 * dropped with it, never merged. The first occurrence claims the identity
 * before capacity is checked, so a repeat of a prompt that did not fit is a
 * duplicate, not a second excess prompt. Capacity is checked after the
 * duplicate rules: a line that was never going to be added is not competing
 * for a slot.
 */
export function planPromptImport(text: string, options: PlanPromptImportOptions): PromptImportPlan {
	const sampleLimit = options.sampleLimit ?? IMPORT_SAMPLE_LIMIT;
	const room = Math.max(0, options.room);
	const records: BulkPromptRecord[] = [];
	const summary: PromptImportSummary = {
		lines: 0,
		added: 0,
		blank: 0,
		duplicateOfExisting: 0,
		duplicateInPaste: 0,
		overCapacity: 0,
		missingPrompt: 0,
		samples: { duplicateOfExisting: [], duplicateInPaste: [], overCapacity: [], missingPrompt: [] },
	};
	const sample = <T>(list: T[], item: T) => {
		if (list.length < sampleLimit) list.push(item);
	};

	const withinPaste = new Set<string>();
	const lines = text.split(/\r?\n/);
	summary.lines = lines.length;

	lines.forEach((raw, index) => {
		if (raw.trim().length === 0) {
			summary.blank += 1;
			return;
		}

		const [first, ...rest] = raw.split(FIELD_SEPARATOR);
		const value = first.trim();
		if (value.length === 0) {
			summary.missingPrompt += 1;
			sample(summary.samples.missingPrompt, index + 1);
			return;
		}

		const key = promptIdentityKey(value);
		if (withinPaste.has(key)) {
			summary.duplicateInPaste += 1;
			sample(summary.samples.duplicateInPaste, value);
			return;
		}
		if (options.existingKeys.has(key)) {
			summary.duplicateOfExisting += 1;
			sample(summary.samples.duplicateOfExisting, value);
			return;
		}
		withinPaste.add(key);

		if (records.length >= room) {
			summary.overCapacity += 1;
			sample(summary.samples.overCapacity, value);
			return;
		}

		records.push({ value, tags: sanitizeUserTags(rest) });
	});

	summary.added = records.length;
	return { records, summary };
}

/**
 * One sentence naming what the parse dropped, or null when it dropped nothing.
 *
 * Over-capacity and missing-prompt lines are deliberately absent: they block
 * the paste outright rather than being skipped, so the caller reports those as
 * an error instead.
 */
export function describeSkipped(skipped: SkippedLines): string | null {
	const parts: string[] = [];
	const duplicates = skipped.duplicateOfExisting.length + skipped.duplicateInPaste.length;
	if (duplicates > 0) {
		parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"}`);
	}
	if (skipped.blank > 0) {
		parts.push(`${skipped.blank} blank line${skipped.blank === 1 ? "" : "s"}`);
	}
	if (parts.length === 0) return null;
	return `Skipped ${parts.join(" and ")}.`;
}

/**
 * The error shown for lines that have tags but no prompt, naming each line so
 * nobody has to count. Null when there are none.
 */
export function describeMissingPrompt(lines: readonly number[]): string | null {
	if (lines.length === 0) return null;
	if (lines.length === 1) {
		return `Line ${lines[0]} has no prompt text before its first semicolon. Fix or remove it to continue.`;
	}
	const listed = `${lines.slice(0, -1).join(", ")} and ${lines[lines.length - 1]}`;
	return `Lines ${listed} have no prompt text before their first semicolon. Fix or remove them to continue.`;
}
