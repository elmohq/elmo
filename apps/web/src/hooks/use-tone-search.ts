import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ResponseSort, responseSortSchema, type ToneFilter, toneFilterSchema } from "@/lib/tone";

/** An absent `sort` means newest first. */
export interface ToneSearch {
	sentiment?: ToneFilter;
	sort?: Exclude<ResponseSort, "newest">;
}

export function validateToneSearch(search: Record<string, unknown>): ToneSearch {
	return {
		sentiment: toneFilterSchema.safeParse(search.sentiment).data,
		sort: responseSortSchema.exclude(["newest"]).safeParse(search.sort).data,
	};
}

export function useToneSearch(onChange?: () => void) {
	const navigate = useNavigate();
	// The routes that own these params may already be gone if the page is left while it hydrates.
	const sentiment = useSearch({ strict: false, shouldThrow: false, select: (s) => validateToneSearch(s).sentiment });
	const sort: ResponseSort =
		useSearch({ strict: false, shouldThrow: false, select: (s) => validateToneSearch(s).sort }) ?? "newest";
	const update = (patch: ToneSearch) => {
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
		setSentiment: (next: ToneFilter | undefined) => update({ sentiment: next }),
		setSort: (next: ResponseSort) => update({ sort: next === "newest" ? undefined : next }),
	};
}
