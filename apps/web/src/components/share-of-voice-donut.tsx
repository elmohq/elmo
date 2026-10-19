/**
 * Donut of share of voice: the brand plus its top competitors, with the long tail bucketed into
 * "Others", the brand's share in the middle and each slice listed beside it.
 */

import { RingChart, type RingSlice } from "@/components/ring-chart";
import { SiteIcon } from "@/components/site-icon";
import { OTHERS_COLOR } from "@/lib/company-colors";
import type { ShareOfVoiceEntry } from "@/server/analysis";

const percent = (value: number, total: number) => `${Math.round((value / total) * 100)}%`;

export function ShareOfVoiceDonut({
	entries,
	colors,
	topN = 4,
	domainFor,
}: {
	entries: ShareOfVoiceEntry[];
	/** Shared with the trend and the leaderboard, so a company is one colour on the page. */
	colors: Map<string, string>;
	topN?: number;
	domainFor?: (name: string) => string | undefined;
}) {
	const slices: RingSlice[] = [];
	let shownCompetitors = 0;
	let othersValue = 0;
	for (const e of entries) {
		if (e.mentions <= 0) continue;
		if (e.isBrand || shownCompetitors < topN) {
			slices.push({
				name: e.name,
				value: e.mentions,
				color: colors.get(e.name) ?? OTHERS_COLOR,
				emphasis: e.isBrand,
				icon: <SiteIcon domain={domainFor?.(e.name)} size="xs" />,
			});
			if (!e.isBrand) shownCompetitors++;
		} else {
			othersValue += e.mentions;
		}
	}
	if (othersValue > 0) slices.push({ name: "Others", value: othersValue, color: OTHERS_COLOR, emphasis: false });

	const total = slices.reduce((s, x) => s + x.value, 0);
	const brand = slices.find((s) => s.emphasis);
	return <RingChart slices={slices} center={brand ? percent(brand.value, total) : "—"} />;
}
