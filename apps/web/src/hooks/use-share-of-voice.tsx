import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { getShareOfVoiceFn } from "@/server/analysis";

export interface ShareOfVoiceFilters {
	days?: number;
	model?: string;
	tags?: string[];
	limit?: number;
}

export const shareOfVoiceKeys = {
	all: ["share-of-voice"] as const,
	list: (brandId: string, filters?: ShareOfVoiceFilters) => [...shareOfVoiceKeys.all, brandId, filters] as const,
};

export function useShareOfVoice(brandId?: string, filters?: ShareOfVoiceFilters) {
	const params = useParams({ strict: false }) as { brand?: string };
	const resolvedBrandId = brandId || params.brand;

	const query = useQuery({
		queryKey: shareOfVoiceKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			getShareOfVoiceFn({
				data: {
					brandId: resolvedBrandId!,
					days: filters?.days ?? 30,
					model: filters?.model,
					tags: filters?.tags?.join(","),
					limit: filters?.limit,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: query.error,
		revalidate: query.refetch,
	};
}
