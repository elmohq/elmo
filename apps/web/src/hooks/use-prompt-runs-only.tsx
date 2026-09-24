import { useQuery } from "@tanstack/react-query";
import { getPromptRunsFn } from "@/server/prompts";

const promptRunsKeys = {
	all: ["prompt-runs"] as const,
	list: (promptId: string, options: { page: number; limit: number; days: number }) =>
		[...promptRunsKeys.all, promptId, options] as const,
};

export function usePromptRunsOnly(promptId?: string, options?: { page?: number; limit?: number; days?: number }) {
	const page = options?.page || 1;
	const limit = options?.limit || 10;
	const days = options?.days || 7;

	const query = useQuery({
		queryKey: promptRunsKeys.list(promptId || "", { page, limit, days }),
		queryFn: () => getPromptRunsFn({ data: { promptId: promptId!, page, limit, days } }),
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
