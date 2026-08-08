/**
 * /app/$brand - Dashboard overview page
 *
 * Shows visibility charts, citation trends, and stats.
 * Displays onboarding wizard if brand is not yet onboarded.
 */
import { useEffect } from "react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import {
	IconArrowRight,
	IconEye,
	IconList,
	IconActivity,
	IconClock,
	IconInfoCircle,
	IconRefresh,
	IconSpeakerphone,
} from "@tabler/icons-react";
import PromptWizard from "@/components/prompt-wizard";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import { TrendChart } from "@/components/trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import type { ClientConfig } from "@workspace/config/types";
import { setPersonProperties } from "@/lib/posthog";
import { formatDate, formatNumber, formatPercent } from "@/i18n/formatting";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";

function getVisibilityBgColor(value: number): string {
	if (value > 75) return "bg-emerald-50 dark:bg-emerald-950/30";
	if (value > 45) return "bg-amber-50 dark:bg-amber-950/30";
	return "bg-rose-50 dark:bg-rose-950/30";
}

function getVisibilityTextColor(value: number): string {
	if (value > 75) return "text-emerald-700 dark:text-emerald-400";
	if (value > 45) return "text-amber-700 dark:text-amber-400";
	return "text-rose-700 dark:text-rose-400";
}

function getVisibilityBorderColor(value: number): string {
	if (value > 75) return "border-emerald-200 dark:border-emerald-800";
	if (value > 45) return "border-amber-200 dark:border-amber-800";
	return "border-rose-200 dark:border-rose-800";
}

/** Most recent non-null value in a daily series — matches the right end of the trend line. */
function lastValue<T>(series: T[], key: keyof T): number | null {
	for (let i = series.length - 1; i >= 0; i--) {
		const v = series[i]?.[key];
		if (typeof v === "number") return v;
	}
	return null;
}

function formatRelativeTime(dateString: string | null): string {
	if (!dateString) return "—";

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	const formatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto", style: "short" });
	if (diffMins < 1) return formatter.format(0, "minute");
	if (diffMins < 60) return formatter.format(-diffMins, "minute");
	if (diffHours < 24) return formatter.format(-diffHours, "hour");
	if (diffDays < 7) return formatter.format(-diffDays, "day");

	return formatDate(date, { month: "short", day: "numeric" });
}

function formatRunFrequency(hours: number): string {
	const weeks = Math.floor(hours / (7 * 24));
	const days = Math.floor((hours % (7 * 24)) / 24);
	const remainingHours = hours % 24;

	const parts: string[] = [];
	if (weeks > 0) parts.push(m.duration_week_short({ count: weeks }));
	if (days > 0) parts.push(m.duration_day_short({ count: days }));
	if (remainingHours > 0) parts.push(m.duration_hour_short({ count: remainingHours }));

	return parts.length > 0 ? `~${parts.join(" ")}` : `~${m.duration_hour_short({ count: 1 })}`;
}

export const Route = createFileRoute("/_authed/app/$brand/")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle(m.page_overview_title(), { appName, brandName }) },
				{ name: "description", content: m.page_overview_description() },
			],
		};
	},
	component: DashboardPage,
});

function StatWithTooltip({
	icon: Icon,
	label,
	value,
	tooltip,
}: {
	icon: typeof IconList;
	label: string;
	value: string | number;
	tooltip: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="flex items-center gap-2 cursor-help">
					<Icon className="h-4 w-4 flex-shrink-0" />
					<span>
						<span className="font-semibold text-foreground">{value}</span> {label}
					</span>
					<IconInfoCircle className="h-3.5 w-3.5 opacity-50" />
				</div>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs text-sm">{tooltip}</TooltipContent>
		</Tooltip>
	);
}

function CardTitleWithTooltip({
	title,
	tooltip,
	className = "",
}: {
	title: string;
	tooltip: string;
	className?: string;
}) {
	return (
		<CardTitle className={`text-sm font-medium flex items-center gap-1.5 ${className}`}>
			{title}
			<Tooltip>
				<TooltipTrigger asChild>
					<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
				</TooltipTrigger>
				<TooltipContent className="max-w-xs text-sm font-normal">{tooltip}</TooltipContent>
			</Tooltip>
		</CardTitle>
	);
}

/** The big "current" stat that fills a card — the latest point of its trend, colour-coded by value. */
function HeroStat({ value, loading }: { value: number | null; loading: boolean }) {
	return (
		<CardContent className="flex-1 flex items-center justify-center">
			<div
				className={`font-bold tracking-tight tabular-nums ${value === null ? "text-muted-foreground" : getVisibilityTextColor(value)}`}
				style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)" }}
			>
				{loading ? (
					<Skeleton className="h-16 w-32" />
				) : value === null ? (
					"—"
				) : (
					formatPercent(value / 100, { maximumFractionDigits: 1 })
				)}
			</div>
		</CardContent>
	);
}

function DashboardPage() {
	const { brand: brandId } = Route.useParams();
	const { brand, isLoading: isLoadingBrand } = useBrand();
	const { dashboardSummary, isLoading: isLoadingSummary } = useDashboardSummary(brand?.id, "1m");
	const { data: sovData, isLoading: isLoadingSov } = useShareOfVoice(brand?.id, { lookback: "1m" });
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;

	const isLoading = isLoadingBrand || isLoadingSummary;

	useEffect(() => {
		if (dashboardSummary?.totalPrompts != null) {
			setPersonProperties({ active_prompt_count: dashboardSummary.totalPrompts });
		}
	}, [dashboardSummary?.totalPrompts]);

	const visibilityTimeSeries = dashboardSummary?.visibilityTimeSeries || [];

	// "Current" = the latest plotted point of each trend, so the hero number always
	// matches the right end of the chart beside it (rather than the whole-window average).
	const currentVisibility = lastValue(visibilityTimeSeries, "overall");
	const sovShare = lastValue(sovData?.shareTimeSeries ?? [], "share");

	if (isLoadingBrand) {
		return (
			<div className="flex flex-1 flex-col">
				<div className="m-auto flex w-full max-w-[1600px] flex-col gap-3 p-4">
					{/* AI Visibility section skeleton */}
					<section className="space-y-2">
						<div className="flex items-center justify-between">
							<h2 className="text-lg font-semibold flex items-center gap-2">
								<IconEye className="h-5 w-5 text-muted-foreground" />
								{m.dashboard_ai_visibility()}
							</h2>
							<Button asChild variant="ghost" size="sm" className="h-8">
								<Link to="/app/$brand/visibility" params={{ brand: brandId }}>
									{m.dashboard_view_visibility()} <IconArrowRight className="h-4 w-4 ml-1" />
								</Link>
							</Button>
						</div>
						<div className="grid gap-4 lg:grid-cols-4">
							<Card className="shadow-none flex flex-col gap-3 py-4">
								<HeroStat value={null} loading />
							</Card>
							<Card className="shadow-none lg:col-span-3 flex flex-col gap-3 py-4">
								<CardHeader className="border-b border-dotted pb-2!">
									<CardTitle className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
										{m.dashboard_visibility_trends()}
										<IconInfoCircle className="h-3.5 w-3.5 opacity-70" />
									</CardTitle>
								</CardHeader>
								<CardContent className="flex-1 min-h-[100px]">
									<Skeleton className="h-full w-full" />
								</CardContent>
							</Card>
						</div>
					</section>

					{/* Share of Voice section skeleton */}
					<section className="space-y-2">
						<div className="flex items-center justify-between">
							<h2 className="text-lg font-semibold flex items-center gap-2">
								<IconSpeakerphone className="h-5 w-5 text-muted-foreground" />
								{m.page_share_title()}
							</h2>
							<Button asChild variant="ghost" size="sm" className="h-8">
								<Link to="/app/$brand/share-of-voice" params={{ brand: brandId }}>
									{m.dashboard_view_share()} <IconArrowRight className="h-4 w-4 ml-1" />
								</Link>
							</Button>
						</div>
						<div className="grid gap-4 lg:grid-cols-4">
							<Card className="shadow-none flex flex-col gap-3 py-4">
								<HeroStat value={null} loading />
							</Card>
							<Card className="shadow-none lg:col-span-3 flex flex-col gap-3 py-4">
								<CardHeader className="border-b border-dotted pb-2!">
									<CardTitle className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
										{m.dashboard_share_trends()}
										<IconInfoCircle className="h-3.5 w-3.5 opacity-70" />
									</CardTitle>
								</CardHeader>
								<CardContent className="flex-1 min-h-[100px]">
									<Skeleton className="h-full w-full" />
								</CardContent>
							</Card>
						</div>
					</section>

					{/* Footer stats skeleton */}
					<section className="pt-2">
						<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
							<div className="flex items-center gap-2">
								<IconList className="h-4 w-4 flex-shrink-0" />
								<Skeleton className="h-4 w-28" />
							</div>
							<div className="flex items-center gap-2">
								<IconActivity className="h-4 w-4 flex-shrink-0" />
								<Skeleton className="h-4 w-32" />
							</div>
							<div className="flex items-center gap-2">
								<IconClock className="h-4 w-4 flex-shrink-0" />
								<Skeleton className="h-4 w-24" />
							</div>
							<div className="flex items-center gap-2">
								<IconRefresh className="h-4 w-4 flex-shrink-0" />
								<Skeleton className="h-4 w-24" />
							</div>
						</div>
					</section>
				</div>
			</div>
		);
	}

	const hasPrompts = brand?.prompts && brand.prompts.length > 0;

	if (!brand?.onboarded) {
		return (
			<div className="space-y-6 max-w-2xl p-4">
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">{m.dashboard_research_title()}</h2>
					<p className="text-muted-foreground text-balance">
						{m.dashboard_research_description()}
					</p>
				</div>
				<PromptWizard
					onComplete={() => {
						const template = clientConfig?.branding.onboardingRedirectUrlTemplate;
						if (template) {
							window.location.href = template.replace("{brandId}", brandId);
						}
					}}
				/>
			</div>
		);
	}

	// Get metrics from optimized summary
	const totalRuns = dashboardSummary?.totalRuns || 0;
	const totalPrompts = dashboardSummary?.totalPrompts || 0;
	const nonBrandedVisibility = dashboardSummary?.nonBrandedVisibility || 0;
	const lastUpdatedAt = dashboardSummary?.lastUpdatedAt || null;

	// Show placeholder if no evaluations yet
	const hasNoEvaluations = totalRuns === 0 && !isLoadingSummary;
	const hasEnabledPrompts = totalPrompts > 0;

	if (hasNoEvaluations) {
		const getMessage = () => {
			if (hasEnabledPrompts) {
				return m.dashboard_waiting_message();
			}
			if (hasPrompts) {
				return m.dashboard_disabled_prompts_message();
			}
			return m.dashboard_no_prompts_message();
		};

		return (
			<div className="flex flex-1 flex-col items-center justify-center p-8 max-w-xl mx-auto text-center">
				<div className="rounded-full bg-muted p-4 mb-6">
					<IconClock className="h-10 w-10 text-muted-foreground" />
				</div>
				<h2 className="text-2xl font-bold mb-3">
					{hasEnabledPrompts ? m.dashboard_waiting_title() : m.dashboard_no_data_title()}
				</h2>
				<p className="text-muted-foreground mb-6 text-balance">{getMessage()}</p>
				<div className="flex flex-col gap-3 w-full">
					{hasEnabledPrompts && (
						<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
							<div className="flex items-center gap-2">
								<IconList className="h-5 w-5 text-muted-foreground" />
								<span className="text-sm">{m.dashboard_prompts_enabled()}</span>
							</div>
							<span className="font-semibold">{formatNumber(totalPrompts)}</span>
						</div>
					)}
					<Button asChild variant="outline" className="w-full">
						<Link to="/app/$brand/settings/prompts" params={{ brand: brandId }}>
							{hasEnabledPrompts
								? m.dashboard_view_prompts()
								: hasPrompts
									? m.dashboard_edit_prompts()
									: m.dashboard_setup_prompts()} {" "}
							<IconArrowRight className="h-4 w-4 ml-1" />
						</Link>
					</Button>
				</div>
				{hasEnabledPrompts && (
					<p className="text-xs text-muted-foreground mt-6">
						{m.dashboard_refresh_hint()}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col">
			<div className="m-auto flex w-full max-w-[1600px] flex-col gap-3 p-4">
				{/* Section 1: AI Visibility */}
				<section className="space-y-2">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold flex items-center gap-2">
							<IconEye className="h-5 w-5 text-muted-foreground" />
							{m.dashboard_ai_visibility()}
						</h2>
						<Button asChild variant="ghost" size="sm" className="h-8">
							<Link to="/app/$brand/visibility" params={{ brand: brandId }}>
								{m.dashboard_view_visibility()} <IconArrowRight className="h-4 w-4 ml-1" />
							</Link>
						</Button>
					</div>

					<div className="grid gap-4 lg:grid-cols-4">
						{/* Hero Visibility Score */}
						<Card
							className={`shadow-none flex flex-col gap-3 py-4 ${currentVisibility === null ? "" : `${getVisibilityBgColor(currentVisibility)} ${getVisibilityBorderColor(currentVisibility)}`}`}
						>
							<HeroStat value={currentVisibility} loading={isLoading} />
						</Card>

						{/* Visibility Chart */}
						<Card className="shadow-none lg:col-span-3 flex flex-col gap-3 py-4">
							<CardHeader className="border-b border-dotted pb-2!">
								<CardTitleWithTooltip
								title={m.dashboard_visibility_trends()}
								tooltip={m.dashboard_visibility_tip({ nonBrandedVisibility })}
								/>
							</CardHeader>
							<CardContent className="flex-1 min-h-[100px]">
								{isLoading ? (
									<Skeleton className="h-full w-full" />
								) : (
									<TrendChart
										data={visibilityTimeSeries.map((p) => ({ date: p.date, value: p.overall }))}
									label={m.dashboard_visibility_chart_label()}
										color="#2563eb"
									/>
								)}
							</CardContent>
						</Card>
					</div>
				</section>

				{/* Section: Share of Voice */}
				<section className="space-y-2">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold flex items-center gap-2">
							<IconSpeakerphone className="h-5 w-5 text-muted-foreground" />
							{m.page_share_title()}
						</h2>
						<Button asChild variant="ghost" size="sm" className="h-8">
							<Link to="/app/$brand/share-of-voice" params={{ brand: brandId }}>
								{m.dashboard_view_share()} <IconArrowRight className="h-4 w-4 ml-1" />
							</Link>
						</Button>
					</div>

					<div className="grid gap-4 lg:grid-cols-4">
						<Card
							className={`shadow-none flex flex-col gap-3 py-4 ${sovShare === null ? "" : `${getVisibilityBgColor(sovShare)} ${getVisibilityBorderColor(sovShare)}`}`}
						>
							<HeroStat value={sovShare} loading={isLoadingSov} />
						</Card>

						<Card className="shadow-none lg:col-span-3 flex flex-col gap-3 py-4">
							<CardHeader className="border-b border-dotted pb-2!">
								<CardTitleWithTooltip
								title={m.dashboard_share_trends()}
								tooltip={m.dashboard_share_tip()}
								/>
							</CardHeader>
							<CardContent className="flex-1 min-h-[100px]">
								{isLoadingSov ? (
									<Skeleton className="h-full w-full" />
								) : (
									<TrendChart
										data={(sovData?.shareTimeSeries ?? []).map((p) => ({ date: p.date, value: p.share }))}
									label={m.page_share_title()}
										color="#2563eb"
									/>
								)}
							</CardContent>
						</Card>
					</div>
				</section>

				{/* Section 3: Tracking Stats */}
				<section className="pt-2">
					<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
						{isLoadingSummary ? (
							<>
								<div className="flex items-center gap-2">
									<IconList className="h-4 w-4 flex-shrink-0" />
									<Skeleton className="h-4 w-28" />
								</div>
								<div className="flex items-center gap-2">
									<IconActivity className="h-4 w-4 flex-shrink-0" />
									<Skeleton className="h-4 w-32" />
								</div>
								<div className="flex items-center gap-2">
									<IconClock className="h-4 w-4 flex-shrink-0" />
									<Skeleton className="h-4 w-24" />
								</div>
								<div className="flex items-center gap-2">
									<IconRefresh className="h-4 w-4 flex-shrink-0" />
									<Skeleton className="h-4 w-24" />
								</div>
							</>
						) : (
							<>
								<StatWithTooltip
									icon={IconList}
									label={m.dashboard_prompts_tracked()}
									value={formatNumber(totalPrompts)}
									tooltip={m.dashboard_prompts_tracked_tip()}
								/>
								<StatWithTooltip
									icon={IconActivity}
									label={m.dashboard_evaluations()}
									value={formatNumber(totalRuns)}
									tooltip={m.dashboard_evaluations_tip()}
								/>
								<StatWithTooltip
									icon={IconClock}
									label={m.dashboard_run_frequency()}
									value={formatRunFrequency(brand?.delayOverrideHours ?? clientConfig?.defaultDelayHours ?? 24)}
									tooltip={m.dashboard_run_frequency_tip({
										frequency: formatRunFrequency(
											brand?.delayOverrideHours ?? clientConfig?.defaultDelayHours ?? 24,
										).replace("~", ""),
									})}
								/>
								<StatWithTooltip
									icon={IconRefresh}
									label={m.dashboard_last_updated()}
									value={formatRelativeTime(lastUpdatedAt)}
									tooltip={
										lastUpdatedAt
											? m.dashboard_last_updated_tip({
													date: formatDate(lastUpdatedAt, { dateStyle: "medium", timeStyle: "short" }),
												})
											: m.dashboard_no_evaluations_tip()
									}
								/>
							</>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
