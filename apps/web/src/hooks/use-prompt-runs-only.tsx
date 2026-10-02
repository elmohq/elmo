import { useQuery } from "@tanstack/react-query";
import type { LookbackPeriod } from "@/lib/lookback";
import { getPromptRunsFn } from "@/server/prompts";

const promptRunsKeys = {
	all: ["prompt-runs"] as const,
	list: (promptId: string, options: { page: number; limit: number; lookback: LookbackPeriod }) =>
		[...promptRunsKeys.all, promptId, options] as const,
};

export function usePromptRunsOnly(promptId?: string, options?: { page?: number; limit?: number; lookback?: LookbackPeriod }) {
	const page = options?.page || 1;
	const limit = options?.limit || 10;
	const lookback = options?.lookback ?? "1w";

	const query = useQuery({
		queryKey: promptRunsKeys.list(promptId || "", { page, limit, lookback }),
		queryFn: () => getPromptRunsFn({ data: { promptId: promptId!, page, limit, lookback } }),
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
