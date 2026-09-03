import { useQuery } from "@tanstack/react-query";
import { getPromptStatsFn } from "@/server/prompts";

const promptStatsKeys = {
	all: ["prompt-stats"] as const,
	detail: (promptId: string, days: number) => [...promptStatsKeys.all, promptId, days] as const,
};

export function usePromptStats(promptId?: string, options?: { days?: number }) {
	const days = options?.days || 7;

	const query = useQuery({
		queryKey: promptStatsKeys.detail(promptId || "", days),
		queryFn: () => getPromptStatsFn({ data: { promptId: promptId!, days } }),
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
