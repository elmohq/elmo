import { MAX_PROMPTS } from "./constants";

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
}

export interface BulkPromptParse {
	/** Lines that became prompts, in the order they were pasted. */
	added: string[];
	skipped: SkippedLines;
}

export interface ParseBulkPromptsOptions {
	/** Prompt values already in the list, used for duplicate detection. */
	existing?: readonly string[];
	/** Total prompts the list may hold. Defaults to `MAX_PROMPTS`. */
	limit?: number;
}

/**
 * Comparison key for two prompts being "the same".
 *
 * Case and surrounding whitespace are ignored, and runs of internal whitespace
 * collapse to one space, so a line re-pasted from a wrapped document does not
 * arrive as a second distinct prompt.
 */
function dedupeKey(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Split pasted text into prompts, one per line.
 *
 * Everything this drops, it names. The caller gets the lines that became
 * prompts and, separately, every line that did not along with the reason, so
 * the screen can tell someone that three of their lines were already in the
 * list rather than leaving them to count.
 *
 * Capacity is measured against the whole list, not the paste: `limit` is the
 * total the list may hold, so a paste of ten lines into a list already holding
 * `limit - 2` prompts contributes two and reports eight as over capacity.
 */
export function parseBulkPrompts(text: string, options: ParseBulkPromptsOptions = {}): BulkPromptParse {
	const { existing = [], limit = MAX_PROMPTS } = options;

	const seen = new Set(existing.map(dedupeKey));
	const room = Math.max(0, limit - existing.length);

	const added: string[] = [];
	const skipped: SkippedLines = {
		blank: 0,
		duplicateOfExisting: [],
		duplicateInPaste: [],
		overCapacity: [],
	};

	const withinPaste = new Set<string>();

	for (const raw of text.split(/\r?\n/)) {
		const value = raw.trim();
		if (value.length === 0) {
			skipped.blank += 1;
			continue;
		}

		const key = dedupeKey(value);
		if (withinPaste.has(key)) {
			skipped.duplicateInPaste.push(value);
			continue;
		}
		if (seen.has(key)) {
			skipped.duplicateOfExisting.push(value);
			continue;
		}

		// Capacity is checked after the duplicate rules on purpose. A line that
		// was never going to be added is not competing for a slot, so reporting
		// it as over capacity would blame the limit for something the limit did
		// not cause.
		if (added.length >= room) {
			skipped.overCapacity.push(value);
			continue;
		}

		withinPaste.add(key);
		added.push(value);
	}

	return { added, skipped };
}

/**
 * One sentence naming everything the parse dropped, or null when it dropped
 * nothing worth saying. Blank lines are counted but never mentioned, because
 * a trailing newline is not a mistake anyone needs told about.
 */
export function describeSkipped(skipped: SkippedLines): string | null {
	const parts: string[] = [];
	const duplicates = skipped.duplicateOfExisting.length + skipped.duplicateInPaste.length;
	if (duplicates > 0) {
		parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"}`);
	}
	if (skipped.overCapacity.length > 0) {
		parts.push(`${skipped.overCapacity.length} over the limit`);
	}
	if (parts.length === 0) return null;
	return `Skipped ${parts.join(" and ")}.`;
}
