import { MAX_PROMPTS } from "./constants";

/** Reported rather than dropped silently, since a vanished line is indistinguishable from a bug. */
export interface SkippedLines {
	blank: number;
	duplicateOfExisting: string[];
	duplicateInPaste: string[];
	overCapacity: string[];
}

export interface BulkPromptParse {
	added: string[];
	skipped: SkippedLines;
}

export interface ParseBulkPromptsOptions {
	existing?: readonly string[];
	/** The whole list's capacity, not the paste's. Defaults to `MAX_PROMPTS`. */
	limit?: number;
}

/** Collapses internal whitespace too, so a line re-pasted from a wrapped document isn't a new prompt. */
export function dedupeKey(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

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

		// After the duplicate rules, so a line that was never going to be added isn't blamed on the limit.
		if (added.length >= room) {
			skipped.overCapacity.push(value);
			continue;
		}

		withinPaste.add(key);
		added.push(value);
	}

	return { added, skipped };
}

/** Omits over-capacity lines: they block the paste, so the caller reports them as an error. */
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
