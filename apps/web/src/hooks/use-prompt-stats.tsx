import { useQuery } from "@tanstack/react-query";
import type { LookbackPeriod } from "@/lib/lookback";
import { getPromptStatsFn } from "@/server/prompts";

const promptStatsKeys = {
	all: ["prompt-stats"] as const,
	detail: (promptId: string, lookback: LookbackPeriod) => [...promptStatsKeys.all, promptId, lookback] as const,
};

export function usePromptStats(promptId?: string, options?: { lookback?: LookbackPeriod }) {
	const lookback = options?.lookback ?? "1w";

	const query = useQuery({
		queryKey: promptStatsKeys.detail(promptId || "", lookback),
		queryFn: () => getPromptStatsFn({ data: { promptId: promptId!, lookback } }),
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
