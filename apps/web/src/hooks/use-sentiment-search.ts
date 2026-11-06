import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ResponseSort, responseSortSchema, type SentimentFilter, sentimentFilterSchema } from "@/lib/sentiment";

/** An absent `sort` means newest first. */
export interface SentimentSearch {
	sentiment?: SentimentFilter;
	sort?: Exclude<ResponseSort, "newest">;
}

export function validateSentimentSearch(search: Record<string, unknown>): SentimentSearch {
	return {
		sentiment: sentimentFilterSchema.safeParse(search.sentiment).data,
		sort: responseSortSchema.exclude(["newest"]).safeParse(search.sort).data,
	};
}

export function useSentimentSearch(onChange?: () => void) {
	const navigate = useNavigate();
	// The routes that own these params may already be gone if the page is left while it hydrates.
	const sentiment = useSearch({
		strict: false,
		shouldThrow: false,
		select: (s) => validateSentimentSearch(s).sentiment,
	});
	const sort: ResponseSort =
		useSearch({ strict: false, shouldThrow: false, select: (s) => validateSentimentSearch(s).sort }) ?? "newest";
	const update = (patch: SentimentSearch) => {
		navigate({
			to: ".",
			search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
			replace: true,
			resetScroll: false,
		});
		onChange?.();
	};
	return {
		sentiment,
		sort,
		setSentiment: (next: SentimentFilter | undefined) => update({ sentiment: next }),
		setSort: (next: ResponseSort) => update({ sort: next === "newest" ? undefined : next }),
	};
}
