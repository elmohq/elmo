import type { ReactNode } from "react";
import { AdRateChart } from "@/components/ads/ad-rate-chart";
import { AuctionMatrix } from "@/components/ads/auction-matrix";
import { ContestedPromptsCard } from "@/components/ads/contested-prompts-card";
import { CreativeGallery } from "@/components/ads/creative-gallery";
import { AdsEmptyState } from "@/components/ads/empty-states";
import { AdMovementCard } from "@/components/ads/movement-card";
import { AdsStatsCards } from "@/components/ads/stats-cards";
import { SurfaceSummary } from "@/components/ads/surface-summary";
import { TopAdvertisersCard } from "@/components/ads/top-advertisers-card";
import type { AdsData } from "@/components/ads/types";

export interface AdsDisplayProps {
	data: AdsData;
	brandId?: string;
	brandName?: string;
	/** Link to the LLM settings page, for the "no ad-capable platforms" case. */
	settingsHref?: ReactNode;
	onCompetitorAdded?: () => void;
}

/**
 * Headline numbers, then the two axes ranked, then the grid that crosses them,
 * then what changed, then the ads themselves.
 *
 * The auction board sits after both ranked lists rather than leading: it is the
 * densest thing on the page and reads far better once the advertiser and prompt
 * names in it are already familiar.
 */
export function AdsDisplay({ data, brandId, brandName, settingsHref, onCompetitorAdded }: AdsDisplayProps) {
	if (data.totalImpressions === 0) {
		return (
			<div className="space-y-4">
				<SurfaceSummary surfaces={data.surfaces} />
				<AdsEmptyState data={data} settingsHref={settingsHref} />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<AdsStatsCards data={data} />
			<SurfaceSummary surfaces={data.surfaces} />
			<AdRateChart data={data.timeSeries} />
			<TopAdvertisersCard data={data} brandId={brandId} brandName={brandName} onCompetitorAdded={onCompetitorAdded} />
			<ContestedPromptsCard data={data} />
			<AuctionMatrix data={data} />
			<AdMovementCard data={data} />
			<CreativeGallery data={data} />
		</div>
	);
}
