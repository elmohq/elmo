import { useQuery } from "@tanstack/react-query";
import { getPromptStatsFn } from "@/server/prompts";

const promptStatsKeys = {
	all: ["prompt-stats"] as const,
	detail: (promptId: string, days: number, endDate?: string) =>
		[...promptStatsKeys.all, promptId, days, endDate] as const,
};

export function usePromptStats(promptId?: string, options?: { days?: number; endDate?: string }) {
	const days = options?.days || 7;
	const endDate = options?.endDate;

	const query = useQuery({
		queryKey: promptStatsKeys.detail(promptId || "", days, endDate),
		queryFn: () => getPromptStatsFn({ data: { promptId: promptId!, days, endDate } }),
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
