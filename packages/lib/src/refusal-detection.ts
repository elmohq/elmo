// Detecting when a model *refuses* to answer a prompt (e.g. "I can't help with
// that", "I must decline") rather than producing a real answer. Refusals carry
// no visibility signal — they shouldn't count as brand mentions and they're
// worth calling out explicitly so operators can see how often engines decline.
// See issue #30.

// Strong, unambiguous refusal openers. Kept as full phrases (not bare "can't")
// so partial refusals inside a genuine answer ("I can't share exact pricing,
// but Acme costs roughly…") don't trip the detector.
export const REFUSAL_PHRASES: readonly string[] = [
	"i can't help with that",
	"i cannot help with that",
	"i can't help with this",
	"i cannot help with this",
	"i can't assist with that",
	"i cannot assist with that",
	"i'm not able to help with that",
	"i am not able to help with that",
	"i'm unable to help with that",
	"i am unable to help with that",
	"i'm not able to assist",
	"i am not able to assist",
	"i'm unable to assist",
	"i am unable to assist",
	"i can't comply with that",
	"i cannot comply with that",
	"i can't comply with this",
	"i cannot comply with this",
	"i can't fulfill that",
	"i cannot fulfill that",
	"i can't fulfill this",
	"i cannot fulfill this",
	"i won't be able to help",
	"i must decline",
	"i have to decline",
	"i'm sorry, but i can't",
	"i'm sorry but i can't",
	"i'm sorry, but i cannot",
	"i'm sorry but i cannot",
	"i can't do that",
	"i cannot do that",
	"i'm not able to provide that",
	"i am not able to provide that",
	"i can't provide that information",
	"i cannot provide that information",
	"i won't be providing",
	"i can't engage with that",
	"i cannot engage with that",
];

// Refusals are usually short, and the refusal phrasing leads the response. We
// look in the opening segment, and also scan short responses in full, so a
// terse "Sorry — I must decline." is caught wherever the phrase sits.
const OPENING_SEGMENT_CHARS = 240;
const SHORT_RESPONSE_CHARS = 600;

function normalize(content: string): string {
	// Fold curly apostrophes so "can't" matches whatever quote style the model used.
	return content.replace(/[‘’]/g, "'").toLowerCase();
}

export interface RefusalResult {
	isRefusal: boolean;
	/** The refusal phrase that matched, when `isRefusal` is true. */
	matchedPhrase?: string;
}

/**
 * Detect whether `content` is a refusal to answer. Returns the matched phrase so
 * callers can log/report exactly what tripped the detector.
 */
export function detectRefusal(content: string): RefusalResult {
	const normalized = normalize(content.trim());
	if (!normalized) return { isRefusal: false };

	const opening = normalized.slice(0, OPENING_SEGMENT_CHARS);
	for (const phrase of REFUSAL_PHRASES) {
		if (opening.includes(phrase)) return { isRefusal: true, matchedPhrase: phrase };
	}

	if (normalized.length <= SHORT_RESPONSE_CHARS) {
		for (const phrase of REFUSAL_PHRASES) {
			if (normalized.includes(phrase)) return { isRefusal: true, matchedPhrase: phrase };
		}
	}

	return { isRefusal: false };
}

export function isRefusal(content: string): boolean {
	return detectRefusal(content).isRefusal;
}
