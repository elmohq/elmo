/**
 * Our G2 rating, as a badge.
 *
 * Shared so the marketing site and the product's sign-in pages quote the same
 * number. Update G2_RATING here when the score on G2 moves — nothing reads it
 * from the API, because G2 blocks automated requests.
 */
import { Star } from "lucide-react";
import { SiG2 } from "react-icons/si";

const G2_RATING = 4.7;
const G2_MAX_RATING = 5;

const RATING_LABEL = `Rated ${G2_RATING} out of ${G2_MAX_RATING} on G2`;

/** G2's brand red, so the mark reads as theirs and not as our accent. */
const G2_RED = "#FF492C";

/** First star through fifth. Their own identity, so a row of them needs no index. */
const STAR_POSITIONS = Array.from({ length: G2_MAX_RATING }, (_, i) => i + 1);

/**
 * Five outlines with a filled row clipped over them, so 4.7 shows as four stars
 * and most of a fifth rather than rounding to a number we didn't earn.
 */
function Stars() {
	const percent = (G2_RATING / G2_MAX_RATING) * 100;
	const row = (filled: boolean) =>
		STAR_POSITIONS.map((position) => (
			<Star
				key={position}
				className={`size-3.5 shrink-0 ${filled ? "fill-amber-400 text-amber-400" : "fill-transparent text-amber-400/40"}`}
				strokeWidth={1.5}
			/>
		));

	return (
		<span className="relative inline-flex" aria-hidden="true">
			<span className="flex gap-0.5">{row(false)}</span>
			<span className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ width: `${percent}%` }}>
				{row(true)}
			</span>
		</span>
	);
}

/**
 * The mark and the stars, unlinked and unlabelled.
 *
 * The rating reads as a mark of quality rather than as something to click — it
 * should reassure in place, not offer a way off the page.
 */
export function G2Stars({ className = "" }: { className?: string }) {
	return (
		<span role="img" aria-label={RATING_LABEL} className={`inline-flex items-center gap-1.5 ${className}`}>
			<SiG2 className="size-4 shrink-0" style={{ color: G2_RED }} aria-hidden="true" />
			<Stars />
		</span>
	);
}
