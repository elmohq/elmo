/**
 * Three framings of the same data, so the page's shape can be chosen by looking
 * at it rather than by describing it. Only one of these survives to become
 * `ads-display.tsx`; the others exist to make the trade-off visible.
 */
import { AdRateChart } from "@/components/ads/ad-rate-chart";
import { AuctionMatrix } from "@/components/ads/auction-matrix";
import { ContestedPromptsCard } from "@/components/ads/contested-prompts-card";
import { CreativeGallery } from "@/components/ads/creative-gallery";
import { AdMovementCard } from "@/components/ads/movement-card";
import { PaidVsEarnedCard } from "@/components/ads/paid-vs-earned-card";
import { AdsStatsCards } from "@/components/ads/stats-cards";
import { TopAdvertisersCard } from "@/components/ads/top-advertisers-card";
import type { AdsData } from "@/components/ads/types";

export interface AdsDisplayProps {
	data: AdsData;
	brandId?: string;
	brandName?: string;
	onCompetitorAdded?: () => void;
}

/**
 * Variant A — reads as a sibling of the Citations page: headline numbers, a
 * trend, a ranked list, then the detail. Lowest design risk.
 */
export function AdsVariantA({ data, brandId, brandName, onCompetitorAdded }: AdsDisplayProps) {
	return (
		<div className="space-y-4">
			<AdsStatsCards data={data} />
			<AdRateChart data={data.timeSeries} />
			<TopAdvertisersCard data={data} brandId={brandId} brandName={brandName} onCompetitorAdded={onCompetitorAdded} />
			<ContestedPromptsCard data={data} />
			<AdMovementCard data={data} />
			<CreativeGallery data={data} />
		</div>
	);
}

/**
 * Variant B — prompt-first. The matrix leads, so the question the page answers
 * first is "which of my queries are contested" rather than "who is biggest".
 */
export function AdsVariantB({ data, brandId, brandName, onCompetitorAdded }: AdsDisplayProps) {
	return (
		<div className="space-y-4">
			<AdsStatsCards data={data} />
			<AuctionMatrix data={data} />
			<div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
				<ContestedPromptsCard data={data} />
				<TopAdvertisersCard data={data} brandId={brandId} brandName={brandName} onCompetitorAdded={onCompetitorAdded} />
			</div>
			<AdRateChart data={data.timeSeries} />
			<PaidVsEarnedCard data={data} />
		</div>
	);
}

/**
 * Variant C — creative-first, the way an ad library reads. The ads themselves
 * are the page; the aggregates are context underneath.
 */
export function AdsVariantC({ data, brandId, brandName, onCompetitorAdded }: AdsDisplayProps) {
	return (
		<div className="space-y-4">
			<AdsStatsCards data={data} />
			<CreativeGallery data={data} pageSize={12} />
			<div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
				<TopAdvertisersCard data={data} brandId={brandId} brandName={brandName} onCompetitorAdded={onCompetitorAdded} />
				<AdMovementCard data={data} />
			</div>
			<AdRateChart data={data.timeSeries} />
		</div>
	);
}
