import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ResponseSort, responseSortSchema, type ToneFilter, toneFilterSchema } from "@/lib/tone";

/** The sentiment filter and sort of a list of answers; newest first when `sort` is absent. */
export interface ToneSearch {
	sentiment?: ToneFilter;
	sort?: Exclude<ResponseSort, "newest">;
}

/** For a route's `validateSearch`, so a filtered list can be linked to. */
export function validateToneSearch(search: Record<string, unknown>): ToneSearch {
	return {
		sentiment: toneFilterSchema.safeParse(search.sentiment).data,
		sort: responseSortSchema.exclude(["newest"]).safeParse(search.sort).data,
	};
}

/** Reads and writes the current route's `ToneSearch`; `onChange` runs after either changes. */
export function useToneSearch(onChange?: () => void) {
	const navigate = useNavigate();
	const sentiment = useSearch({ strict: false, select: (s) => validateToneSearch(s).sentiment });
	const sort: ResponseSort = useSearch({ strict: false, select: (s) => validateToneSearch(s).sort }) ?? "newest";
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
