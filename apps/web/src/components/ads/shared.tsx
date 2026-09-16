import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";
import type { AdAttribution } from "@/components/ads/types";
import { SiteIcon } from "@/components/site-icon";
import { CATEGORY_CONFIG } from "@/lib/domain-categories";

/**
 * Attribution reuses the Citations palette so an advertiser reads the same
 * colour here as the domain does over there. Brand and competitor are the two
 * real series; "other" is the de-emphasis grey for the long tail, which is why
 * it sits below the chroma floor a categorical hue would need — every surface
 * that uses it also direct-labels the row.
 */
export const AD_ATTRIBUTION_META: Record<AdAttribution, { label: string; color: string; dotClass: string }> = {
	brand: {
		label: "Your brand",
		color: CATEGORY_CONFIG.brand.chartColor,
		dotClass: CATEGORY_CONFIG.brand.chartDotClass,
	},
	competitor: {
		label: "Tracked competitor",
		color: CATEGORY_CONFIG.competitor.chartColor,
		dotClass: CATEGORY_CONFIG.competitor.chartDotClass,
	},
	other: {
		label: "Other advertiser",
		color: CATEGORY_CONFIG.other.chartColor,
		dotClass: CATEGORY_CONFIG.other.chartDotClass,
	},
};

export const AD_ATTRIBUTION_ORDER: AdAttribution[] = ["brand", "competitor", "other"];

export function AttributionDot({ attribution, className }: { attribution: AdAttribution; className?: string }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span
						className={cn(
							"inline-block size-2 shrink-0 rounded-full",
							AD_ATTRIBUTION_META[attribution].dotClass,
							className,
						)}
					/>
				}
			/>
			<TooltipContent className="text-xs font-normal">{AD_ATTRIBUTION_META[attribution].label}</TooltipContent>
		</Tooltip>
	);
}

/** Icon + name + host, the way every advertiser is named across the page. */
export function AdvertiserLabel({
	domain,
	name,
	attribution,
	className,
}: {
	domain: string;
	name: string;
	attribution: AdAttribution;
	className?: string;
}) {
	return (
		<span className={cn("flex min-w-0 items-center gap-2", className)}>
			<AttributionDot attribution={attribution} />
			<SiteIcon domain={domain} size="xs" />
			<span className="min-w-0 truncate font-medium">{name}</span>
			<span className="min-w-0 shrink truncate text-xs text-muted-foreground">{domain}</span>
		</span>
	);
}

export function InfoTitle({ children, tooltip }: { children: ReactNode; tooltip: ReactNode }) {
	return (
		<span className="flex items-center gap-1.5">
			{children}
			<Tooltip>
				<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground" />} />
				<TooltipContent className="max-w-xs text-sm font-normal">{tooltip}</TooltipContent>
			</Tooltip>
		</span>
	);
}

/** Legend for the attribution encoding. Present whenever colour carries identity. */
export function AttributionLegend({ only }: { only?: AdAttribution[] }) {
	const keys = only ?? AD_ATTRIBUTION_ORDER;
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
			{keys.map((key) => (
				<span key={key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
					<span className={cn("inline-block size-2 rounded-full", AD_ATTRIBUTION_META[key].dotClass)} />
					{AD_ATTRIBUTION_META[key].label}
				</span>
			))}
		</div>
	);
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

export function formatDay(value: string): string {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("en-US", DATE_FORMAT);
}

export function formatRange(from: string, to: string): string {
	return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
}

export const percent = (value: number) => `${Math.round(value * 10) / 10}%`;
