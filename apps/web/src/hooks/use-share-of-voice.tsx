import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { computeBrandData } from "@/lib/brand-data/client";
import type { LookbackPeriod } from "@/lib/lookback";

export interface ShareOfVoiceFilters {
	lookback?: LookbackPeriod;
	model?: string;
	/** Tag filter (resolved to prompt IDs server-side, like the visibility page). */
	tags?: string[];
}

const shareOfVoiceKeys = {
	all: ["share-of-voice"] as const,
	list: (brandId: string, filters?: ShareOfVoiceFilters) => [...shareOfVoiceKeys.all, brandId, filters] as const,
};

export function useShareOfVoice(brandId?: string, filters?: ShareOfVoiceFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: shareOfVoiceKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			computeBrandData("shareOfVoice", {
				brandId: resolvedBrandId!,
				lookback: filters?.lookback ?? "1m",
				model: filters?.model,
				tags: filters?.tags?.join(","),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
		enabled: !!resolvedBrandId,
		staleTime: 5 * 60_000,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}

export function useCompetitiveLandscape(brandId?: string, filters?: ShareOfVoiceFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	return useQuery({
		queryKey: [...shareOfVoiceKeys.all, "landscape", resolvedBrandId || "", filters] as const,
		queryFn: () =>
			computeBrandData("landscape", {
				brandId: resolvedBrandId!,
				lookback: filters?.lookback ?? "1m",
				model: filters?.model,
				tags: filters?.tags?.join(","),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
		enabled: !!resolvedBrandId,
		staleTime: 5 * 60_000,
		placeholderData: (prev) => prev,
	});
}
