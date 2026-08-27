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
export const G2_PROFILE_URL = "https://www.g2.com/products/blue-whale-software-llc-elmo/reviews";

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
 * @param className tone for the label; the mark and stars keep their own colors.
 */
export function G2Rating({ className = "" }: { className?: string }) {
	return (
		<a
			href={G2_PROFILE_URL}
			target="_blank"
			rel="noopener noreferrer"
			className={`inline-flex items-center gap-2 text-xs transition-opacity hover:opacity-80 ${className}`}
		>
			<SiG2 className="size-4 shrink-0" style={{ color: G2_RED }} aria-hidden="true" />
			<Stars />
			<span>
				{G2_RATING}/{G2_MAX_RATING} stars on G2
			</span>
		</a>
	);
}
