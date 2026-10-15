import { useQuery } from "@tanstack/react-query";
import type { LookbackPeriod } from "@/lib/lookback";
import type { ResponseSort, SentimentFilter } from "@/lib/sentiment";
import { getPromptRunsFn } from "@/server/prompts";

interface PromptRunsOptions {
	page: number;
	limit: number;
	lookback: LookbackPeriod;
	sentiment?: SentimentFilter;
	sort: ResponseSort;
}

const promptRunsKeys = {
	all: ["prompt-runs"] as const,
	list: (promptId: string, options: PromptRunsOptions) => [...promptRunsKeys.all, promptId, options] as const,
};

export function usePromptRunsOnly(promptId?: string, options?: Partial<PromptRunsOptions>) {
	const resolved: PromptRunsOptions = {
		page: options?.page || 1,
		limit: options?.limit || 10,
		lookback: options?.lookback ?? "1w",
		sentiment: options?.sentiment,
		sort: options?.sort ?? "newest",
	};

	const query = useQuery({
		queryKey: promptRunsKeys.list(promptId || "", resolved),
		queryFn: () => getPromptRunsFn({ data: { promptId: promptId!, ...resolved } }),
		enabled: !!promptId,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
