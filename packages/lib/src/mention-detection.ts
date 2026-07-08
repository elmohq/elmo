// Detecting whether a brand or competitor is *genuinely* mentioned in a model
// response — as opposed to merely named inside an "I couldn't find anything
// about <brand>" style absence statement.
//
// Naive substring matching counts "I have no information about Acme" as a brand
// mention, which inflates visibility/share-of-voice with non-mentions. We treat
// a name as mentioned only when it appears in at least one clause that is not an
// explicit absence statement. See issue #5.

// Phrases that signal the model is reporting a *lack* of knowledge about the
// thing named alongside them. Kept specific (multi-word) so ordinary prose like
// "no doubt the best" or "I don't think so" doesn't suppress a real mention.
export const ABSENCE_PHRASES: readonly string[] = [
	"couldn't find",
	"could not find",
	"couldn't locate",
	"could not locate",
	"couldn't identify",
	"could not identify",
	"didn't find",
	"did not find",
	"unable to find",
	"unable to locate",
	"unable to identify",
	"no information about",
	"no information on",
	"no information regarding",
	"no specific information about",
	"no specific information on",
	"don't have information",
	"do not have information",
	"don't have any information",
	"do not have any information",
	"don't have specific information",
	"do not have specific information",
	"not aware of",
	"not familiar with",
	"never heard of",
	"no data on",
	"no data about",
	"no results for",
	"no details about",
	"no details on",
	"no record of",
	"no mention of",
];

// Split a response into clauses. We break on sentence terminators and newlines,
// and additionally on contrastive conjunctions ("…, but X is great") so that a
// real mention riding alongside an absence statement in the same sentence
// ("I couldn't find pricing, but Acme is excellent") is still counted.
const CLAUSE_SPLIT = /(?<=[.!?])\s+|\n+|;\s*|,?\s+(?:but|however|although|though|whereas|yet)\s+/i;

export function splitClauses(content: string): string[] {
	return content.split(CLAUSE_SPLIT);
}

export function isAbsenceClause(clauseLower: string): boolean {
	return ABSENCE_PHRASES.some((phrase) => clauseLower.includes(phrase));
}

/**
 * True if `name` appears in `content` in at least one clause that is not an
 * explicit absence statement. Returns false when the name never appears, or
 * appears only inside "couldn't find / no information about" style clauses.
 *
 * Case-insensitive; uses substring matching (matching existing behavior) so the
 * only change versus a naive `includes` is the absence filtering.
 */
export function nameMentioned(content: string, name: string): boolean {
	const nameLower = name.trim().toLowerCase();
	if (!nameLower) return false;

	for (const clause of splitClauses(content)) {
		const clauseLower = clause.toLowerCase();
		if (clauseLower.includes(nameLower) && !isAbsenceClause(clauseLower)) {
			return true;
		}
	}
	return false;
}
