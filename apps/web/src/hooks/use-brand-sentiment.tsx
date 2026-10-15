import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { ShareOfVoiceFilters } from "@/hooks/use-share-of-voice";
import { getBrandSentimentFn } from "@/server/analysis";

export function useBrandSentiment(brandId?: string, filters?: ShareOfVoiceFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	return useQuery({
		queryKey: ["brand-sentiment", resolvedBrandId || "", filters] as const,
		queryFn: () =>
			getBrandSentimentFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback ?? "1m",
					model: filters?.model,
					tags: filters?.tags?.join(","),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		placeholderData: (prev) => prev,
	});
}
