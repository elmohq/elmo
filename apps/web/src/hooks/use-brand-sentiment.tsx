import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { ShareOfVoiceFilters } from "@/hooks/use-share-of-voice";
import { brandDataQuery, computeBrandData } from "@/lib/brand-data/client";

export function useBrandSentiment(brandId?: string, filters?: ShareOfVoiceFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	return useQuery({
		queryKey: ["brand-sentiment", resolvedBrandId || "", filters] as const,
		queryFn: () =>
			computeBrandData("brandSentiment", {
				brandId: resolvedBrandId!,
				lookback: filters?.lookback ?? "1m",
				model: filters?.model,
				tags: filters?.tags?.join(","),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
		enabled: !!resolvedBrandId,
		...brandDataQuery,
		placeholderData: (prev) => prev,
	});
}
