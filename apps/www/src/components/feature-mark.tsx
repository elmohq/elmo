import { Check, X } from "lucide-react";

/**
 * Lucide icons are aria-hidden, so without the text a feature table reads to
 * crawlers, answer engines, and screen readers as feature names with no answers.
 */
export function FeatureMark({ has }: { has: boolean }) {
	return has ? (
		<>
			<Check className="mx-auto h-4 w-4 text-blue-600" />
			<span className="sr-only">Yes</span>
		</>
	) : (
		<>
			<X className="mx-auto h-4 w-4 text-zinc-300" />
			<span className="sr-only">No</span>
		</>
	);
}
