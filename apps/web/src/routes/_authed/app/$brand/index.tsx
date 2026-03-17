/**
 * /app/$brand - Dashboard overview page
 *
 * Shows visibility charts, citation trends, and stats.
 * Displays onboarding wizard if brand is not yet onboarded.
 */
import { useState, useMemo, useEffect } from "react";
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
	IconLink,
} from "@tabler/icons-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import PromptWizard from "@/components/prompt-wizard";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import type { VisibilityTimeSeriesPoint, CitationTimeSeriesPoint } from "@/server/dashboard";
import { CATEGORY_CONFIG } from "@/lib/domain-categories";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@workspace/ui/components/chart";
import type { ClientConfig } from "@workspace/config/types";
import { setPersonProperties } from "@/lib/posthog";

// Extended data point types for dashboard charts
interface ExtendedVisibilityPoint extends VisibilityTimeSeriesPoint {
	_extended?: boolean;
	overallReal?: number | null;
}

interface ExtendedCitationPoint extends CitationTimeSeriesPoint {
	_extended?: boolean;
	brandReal?: number;
	competitorReal?: number;
	socialMediaReal?: number;
	googleReal?: number;
	institutionalReal?: number;
}

/**
 * Extends visibility time series data to chart edges using straight lines.
 */
function extendVisibilityData(data: VisibilityTimeSeriesPoint[]): ExtendedVisibilityPoint[] {
	if (data.length === 0) return [];

	const extendedData: ExtendedVisibilityPoint[] = data.map((point) => ({
		...point,
		overallReal: point.overall,
	}));

	let firstValidIndex = -1;
	let lastValidIndex = -1;
	let firstValue: number | null = null;
	let lastValue: number | null = null;

	for (let i = 0; i < extendedData.length; i++) {
		if (extendedData[i].overall !== null) {
			if (firstValidIndex === -1) {
				firstValidIndex = i;
				firstValue = extendedData[i].overall;
			}
			lastValidIndex = i;
			lastValue = extendedData[i].overall;
		}
	}

	if (firstValidIndex !== -1 && lastValidIndex !== -1) {
		for (let i = 0; i < firstValidIndex; i++) {
			extendedData[i].overall = firstValue;
			extendedData[i].overallReal = null;
			extendedData[i]._extended = true;
		}
		for (let i = lastValidIndex + 1; i < extendedData.length; i++) {
			extendedData[i].overall = lastValue;
			extendedData[i].overallReal = null;
			extendedData[i]._extended = true;
		}
	}

	return extendedData;
}

/**
 * Extends citation time series data to chart edges using straight lines.
 */
function extendCitationData(data: CitationTimeSeriesPoint[]): ExtendedCitationPoint[] {
	if (data.length === 0) return [];

	const extendedData: ExtendedCitationPoint[] = data.map((point) => ({
		...point,
		brandReal: point.brand,
		competitorReal: point.competitor,
		socialMediaReal: point.socialMedia,
		googleReal: point.google,
		institutionalReal: point.institutional,
	}));

	let firstValidIndex = -1;
	let lastValidIndex = -1;

	for (let i = 0; i < extendedData.length; i++) {
		const point = extendedData[i];
		const hasData = point.brand > 0 || point.competitor > 0 || point.socialMedia > 0 || point.google > 0 || point.institutional > 0;
		if (hasData) {
			if (firstValidIndex === -1) {
				firstValidIndex = i;
			}
			lastValidIndex = i;
		}
	}

	if (firstValidIndex !== -1 && lastValidIndex !== -1) {
		const firstPoint = extendedData[firstValidIndex];
		const lastPoint = extendedData[lastValidIndex];

		for (let i = 0; i < firstValidIndex; i++) {
			extendedData[i].brand = firstPoint.brand;
			extendedData[i].competitor = firstPoint.competitor;
			extendedData[i].socialMedia = firstPoint.socialMedia;
			extendedData[i].google = firstPoint.google;
			extendedData[i].institutional = firstPoint.institutional;
			extendedData[i].brandReal = 0;
			extendedData[i].competitorReal = 0;
			extendedData[i].socialMediaReal = 0;
			extendedData[i].googleReal = 0;
			extendedData[i].institutionalReal = 0;
			extendedData[i]._extended = true;
		}
		for (let i = lastValidIndex + 1; i < extendedData.length; i++) {
			extendedData[i].brand = lastPoint.brand;
			extendedData[i].competitor = lastPoint.competitor;
			extendedData[i].socialMedia = lastPoint.socialMedia;
			extendedData[i].google = lastPoint.google;
			extendedData[i].institutional = lastPoint.institutional;
			extendedData[i].brandReal = 0;
			extendedData[i].competitorReal = 0;
			extendedData[i].socialMediaReal = 0;
			extendedData[i].googleReal = 0;
			extendedData[i].institutionalReal = 0;
			extendedData[i]._extended = true;
		}
	}

	return extendedData;
}

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

function getVisibilityLabelColor(value: number): string {
	if (value > 75) return "text-emerald-600 dark:text-emerald-500";
	if (value > 45) return "text-amber-600 dark:text-amber-500";
	return "text-rose-600 dark:text-rose-500";
}

function getVisibilityBorderColor(value: number): string {
	if (value > 75) return "border-emerald-200 dark:border-emerald-800";
	if (value > 45) return "border-amber-200 dark:border-amber-800";
	return "border-rose-200 dark:border-rose-800";
}

function formatRelativeTime(dateString: string | null): string {
	if (!dateString) return "Never";

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const DEFAULT_DELAY_HOURS = 72;

function formatRunFrequency(hours: number): string {
	const weeks = Math.floor(hours / (7 * 24));
	const days = Math.floor((hours % (7 * 24)) / 24);
	const remainingHours = hours % 24;

	const parts: string[] = [];
	if (weeks > 0) parts.push(`${weeks}w`);
	if (days > 0) parts.push(`${days}d`);
	if (remainingHours > 0) parts.push(`${remainingHours}h`);

	return parts.length > 0 ? `~${parts.join(" ")}` : "~1h";
}

export const Route = createFileRoute("/_authed/app/$brand/")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Overview", { appName, brandName }) },
				{ name: "description", content: "Dashboard overview of AI visibility and citations." },
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
			<TooltipContent className="max-w-xs text-sm">
				{tooltip}
			</TooltipContent>
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
				<TooltipContent className="max-w-xs text-sm font-normal">
					{tooltip}
				</TooltipContent>
			</Tooltip>
		</CardTitle>
	);
}

function DashboardPage() {
	const { brand: brandId } = Route.useParams();
	const { brand, isLoading: isLoadingBrand } = useBrand();
	const { dashboardSummary, isLoading: isLoadingSummary } = useDashboardSummary(brand?.id, "1m");
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;

	const isLoading = isLoadingBrand || isLoadingSummary;

	useEffect(() => {
		if (dashboardSummary?.totalPrompts != null) {
			setPersonProperties({ active_prompt_count: dashboardSummary.totalPrompts });
		}
	}, [dashboardSummary?.totalPrompts]);

	const visibilityTimeSeries = dashboardSummary?.visibilityTimeSeries || [];
	const citationTimeSeries = dashboardSummary?.citationTimeSeries || [];

	const extendedVisibilityData = useMemo(
		() => extendVisibilityData(visibilityTimeSeries),
		[visibilityTimeSeries],
	);
	const extendedCitationData = useMemo(
		() => extendCitationData(citationTimeSeries),
		[citationTimeSeries],
	);

	if (isLoadingBrand) {
		return (
			<div className="flex flex-1 flex-col gap-4 p-4 max-w-[1600px] mx-auto w-full">
				{/* AI Visibility section skeleton */}
				<section className="space-y-3">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold flex items-center gap-2">
							<IconEye className="h-5 w-5 text-muted-foreground" />
							AI Visibility
						</h2>
						<Button asChild variant="ghost" size="sm" className="h-8">
							<Link to="/app/$brand/visibility" params={{ brand: brandId }}>
								View Visibility <IconArrowRight className="h-4 w-4 ml-1" />
							</Link>
						</Button>
					</div>
					<div className="grid gap-4 lg:grid-cols-4">
						<Card className="shadow-none flex flex-col">
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
									Current Visibility
									<IconInfoCircle className="h-3.5 w-3.5 opacity-70" />
								</CardTitle>
							</CardHeader>
							<CardContent className="flex-1 flex flex-col justify-center gap-4">
								<div style={{ fontSize: "clamp(2.5rem, 6vw, 6rem)" }}>
									<Skeleton className="h-20 w-36" />
								</div>
							</CardContent>
						</Card>
						<Card className="shadow-none lg:col-span-3 flex flex-col">
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
									Visibility Trends (30d)
									<IconInfoCircle className="h-3.5 w-3.5 opacity-70" />
								</CardTitle>
							</CardHeader>
							<CardContent className="flex-1 min-h-[120px]">
								<Skeleton className="h-full w-full" />
							</CardContent>
						</Card>
					</div>
				</section>

				{/* Citations section skeleton */}
				<section className="space-y-3">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold flex items-center gap-2">
							<IconLink className="h-5 w-5 text-muted-foreground" />
							Citations
						</h2>
						<Button asChild variant="ghost" size="sm" className="h-8">
							<Link to="/app/$brand/citations" params={{ brand: brandId }}>
								View Citations <IconArrowRight className="h-4 w-4 ml-1" />
							</Link>
						</Button>
					</div>
					<Card className="shadow-none">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
								Citation Category Trends (30d)
								<IconInfoCircle className="h-3.5 w-3.5 opacity-70" />
							</CardTitle>
						</CardHeader>
						<CardContent>
							<Skeleton className="h-[140px] w-full" />
						</CardContent>
					</Card>
				</section>

				{/* Footer stats skeleton */}
				<section className="pt-4">
					<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
						<div className="flex items-center gap-2"><IconList className="h-4 w-4 flex-shrink-0" /><Skeleton className="h-4 w-28" /></div>
						<div className="flex items-center gap-2"><IconActivity className="h-4 w-4 flex-shrink-0" /><Skeleton className="h-4 w-32" /></div>
						<div className="flex items-center gap-2"><IconClock className="h-4 w-4 flex-shrink-0" /><Skeleton className="h-4 w-24" /></div>
						<div className="flex items-center gap-2"><IconRefresh className="h-4 w-4 flex-shrink-0" /><Skeleton className="h-4 w-24" /></div>
					</div>
				</section>
			</div>
		);
	}

	const hasPrompts = brand?.prompts && brand.prompts.length > 0;

	if (!brand?.onboarded) {
		return (
			<div className="space-y-6 max-w-2xl p-4">
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">Research Brand Data</h2>
					<p className="text-muted-foreground text-balance">
						We will analyze your website and find the best generative AI prompts to track. This process may take a
						couple of minutes.
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
	const averageVisibility = dashboardSummary?.averageVisibility || 0;
	const nonBrandedVisibility = dashboardSummary?.nonBrandedVisibility || 0;
	const lastUpdatedAt = dashboardSummary?.lastUpdatedAt || null;

	// Show placeholder if no evaluations yet
	const hasNoEvaluations = totalRuns === 0 && !isLoadingSummary;
	const hasEnabledPrompts = totalPrompts > 0;

	if (hasNoEvaluations) {
		const getMessage = () => {
			if (hasEnabledPrompts) {
				return "You are ready to track your AI visibility. We're currently running the first evaluation against AI models. This usually takes a few minutes.";
			}
			if (hasPrompts) {
				return "You have prompts configured but none are currently enabled. Add or enable some prompts to start tracking your AI visibility.";
			}
			return "Set up prompts to start tracking your AI visibility. Once configured, we'll evaluate them against AI models automatically.";
		};

		return (
			<div className="flex flex-1 flex-col items-center justify-center p-8 max-w-xl mx-auto text-center">
				<div className="rounded-full bg-muted p-4 mb-6">
					<IconClock className="h-10 w-10 text-muted-foreground" />
				</div>
				<h2 className="text-2xl font-bold mb-3">
					{hasEnabledPrompts ? "Waiting for First Evaluation" : "No Data Yet"}
				</h2>
				<p className="text-muted-foreground mb-6 text-balance">
					{getMessage()}
				</p>
				<div className="flex flex-col gap-3 w-full">
					{hasEnabledPrompts && (
						<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
							<div className="flex items-center gap-2">
								<IconList className="h-5 w-5 text-muted-foreground" />
								<span className="text-sm">Prompts configured and enabled</span>
							</div>
							<span className="font-semibold">{totalPrompts.toLocaleString()}</span>
						</div>
					)}
					<Button asChild variant="outline" className="w-full">
						<Link to="/app/$brand/settings/prompts" params={{ brand: brandId }}>
							{hasEnabledPrompts ? "View Your Prompts" : hasPrompts ? "Edit Prompts" : "Set Up Prompts"} <IconArrowRight className="h-4 w-4 ml-1" />
						</Link>
					</Button>
				</div>
				{hasEnabledPrompts && (
					<p className="text-xs text-muted-foreground mt-6">
						Refresh this page in a few minutes to see your AI visibility data.
					</p>
				)}
			</div>
		);
	}

	const visibilityChartConfig: ChartConfig = {
		overall: {
			label: "AI Visibility (7d avg)",
			color: "#10b981",
		},
	};

	const citationsChartConfig: ChartConfig = {
		brand: { label: "Your Brand", color: CATEGORY_CONFIG.brand.chartColor },
		competitor: { label: "Competitors", color: CATEGORY_CONFIG.competitor.chartColor },
		socialMedia: { label: "Social Media", color: CATEGORY_CONFIG.social_media.chartColor },
		google: { label: "Google", color: CATEGORY_CONFIG.google.chartColor },
		institutional: { label: "Institutional", color: CATEGORY_CONFIG.institutional.chartColor },
		other: { label: "Other", color: CATEGORY_CONFIG.other.chartColor },
	};

	return (
		<div className="flex flex-1 flex-col gap-4 p-4 max-w-[1600px] mx-auto w-full">

			{/* Section 1: AI Visibility */}
			<section className="space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold flex items-center gap-2">
						<IconEye className="h-5 w-5 text-muted-foreground" />
						AI Visibility
					</h2>
					<Button asChild variant="ghost" size="sm" className="h-8">
						<Link to="/app/$brand/visibility" params={{ brand: brandId }}>
							View Visibility <IconArrowRight className="h-4 w-4 ml-1" />
						</Link>
					</Button>
				</div>

				<div className="grid gap-4 lg:grid-cols-4">
					{/* Hero Visibility Score */}
					<Card className={`shadow-none flex flex-col ${isLoading ? "" : `${getVisibilityBgColor(averageVisibility)} ${getVisibilityBorderColor(averageVisibility)}`}`}>
						<CardHeader className="pb-2">
							<CardTitle className={`text-sm font-medium flex items-center gap-1.5 ${isLoading ? "text-muted-foreground" : getVisibilityLabelColor(averageVisibility)}`}>
								Current Visibility
								<Tooltip>
									<TooltipTrigger asChild>
										<IconInfoCircle className="h-3.5 w-3.5 cursor-help opacity-70" />
									</TooltipTrigger>
									<TooltipContent className="max-w-xs text-sm font-normal">
										The percentage of AI responses to your prompts where your brand is mentioned. For prompts that do not contain your brand, the AI visibility is {nonBrandedVisibility}%.
									</TooltipContent>
								</Tooltip>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex-1 flex flex-col justify-center gap-4">
							<div
								className={`font-bold tracking-tight ${isLoading ? "text-muted-foreground" : getVisibilityTextColor(averageVisibility)}`}
								style={{ fontSize: "clamp(2.5rem, 6vw, 6rem)" }}
							>
								{isLoading ? <Skeleton className="h-20 w-36" /> : `${averageVisibility}%`}
							</div>
						</CardContent>
					</Card>

					{/* Visibility Chart */}
					<Card className="shadow-none lg:col-span-3 flex flex-col">
						<CardHeader className="pb-2">
						<CardTitleWithTooltip
							title="Visibility Trends (30d)"
							tooltip="AI visibility can change based on underlying modifications to AI models themselves, the prompts you track, or the websites AI scans before generating responses. Data is smoothed to account for staggered prompt schedules."
						/>
						</CardHeader>
						<CardContent className="flex-1 min-h-[120px]">
							{isLoading ? (
								<Skeleton className="h-full w-full" />
							) : (
								<ChartContainer config={visibilityChartConfig} className="aspect-auto h-full w-full">
									<AreaChart data={extendedVisibilityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
										<CartesianGrid vertical={false} strokeDasharray="3 3" />
										<XAxis
											dataKey="date"
											tickLine={false}
											axisLine={false}
											tickMargin={8}
											minTickGap={50}
											tick={{ fontSize: 11 }}
											tickFormatter={(value) => {
												const [year, month, day] = value.split("-").map(Number);
												const date = new Date(year, month - 1, day);
												return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
											}}
										/>
										<YAxis
											domain={[0, "auto"]}
											tickLine={false}
											axisLine={false}
											tickMargin={8}
											tickCount={4}
											tick={{ fontSize: 11 }}
											tickFormatter={(value) => `${value}%`}
										/>
										<ChartTooltip
											isAnimationActive={false}
											cursor={false}
											content={({ active, payload, label }) => {
												if (!active || !payload?.length) return null;
												const dataPoint = payload[0]?.payload as ExtendedVisibilityPoint;
												if (dataPoint?._extended) return null;

												const [year, month, day] = (label as string).split("-").map(Number);
												const date = new Date(year, month - 1, day);
												const formattedDate = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

												return (
													<div className="border-border/50 bg-background grid min-w-[12rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
														<div className="font-medium">{formattedDate}</div>
														<div className="flex items-center gap-2">
															<div className="shrink-0 rounded-[2px] h-2.5 w-2.5 bg-emerald-500" />
															<span className="text-muted-foreground">AI Visibility (7d avg)</span>
															<span className="ml-auto font-mono tabular-nums">{dataPoint?.overall}%</span>
														</div>
													</div>
												);
											}}
										/>
										<Area
											dataKey="overall"
											type="monotone"
											stroke="#10b981"
											strokeWidth={2}
											fill="#10b981"
											fillOpacity={0.8}
											connectNulls={true}
										/>
									</AreaChart>
								</ChartContainer>
							)}
						</CardContent>
					</Card>
				</div>
			</section>

			{/* Section 2: Citations */}
			<section className="space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold flex items-center gap-2">
						<IconLink className="h-5 w-5 text-muted-foreground" />
						Citations
					</h2>
					<Button asChild variant="ghost" size="sm" className="h-8">
						<Link to="/app/$brand/citations" params={{ brand: brandId }}>
							View Citations <IconArrowRight className="h-4 w-4 ml-1" />
						</Link>
					</Button>
				</div>

				<Card className="shadow-none">
					<CardHeader className="pb-2">
						<CardTitleWithTooltip
							title="Citation Category Trends (30d)"
							tooltip="Distribution of citations by category over time, shown as a percentage of all citations each day. Data is smoothed to account for staggered prompt schedules."
						/>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<Skeleton className="h-[140px] w-full" />
						) : (
							<ChartContainer config={citationsChartConfig} className="aspect-auto h-[140px] w-full">
								<AreaChart data={extendedCitationData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
									<CartesianGrid vertical={false} strokeDasharray="3 3" />
									<XAxis
										dataKey="date"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										minTickGap={50}
										tick={{ fontSize: 11 }}
										tickFormatter={(value) => {
											const [year, month, day] = value.split("-").map(Number);
											const date = new Date(year, month - 1, day);
											return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
										}}
									/>
									<YAxis
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										tickCount={4}
										tick={{ fontSize: 11 }}
										tickFormatter={(value) => `${value}%`}
									/>
									<ChartTooltip
										isAnimationActive={false}
										cursor={false}
										content={({ active, payload, label }) => {
											if (!active || !payload?.length) return null;
											const dataPoint = payload[0]?.payload as ExtendedCitationPoint;
											if (dataPoint?._extended) return null;

											const [year, month, day] = (label as string).split("-").map(Number);
											const date = new Date(year, month - 1, day);
											const formattedDate = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

											return (
												<div className="border-border/50 bg-background grid min-w-[10rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
													<div className="font-medium">{formattedDate}</div>
												<div className="grid gap-1">
													{(["brand", "competitor", "social_media", "google", "institutional", "other"] as const).map((cat) => {
														const cfg = CATEGORY_CONFIG[cat];
														const key = cat === "social_media" ? "socialMedia" : cat;
														const value = dataPoint?.[key as keyof ExtendedCitationPoint] as number | undefined;
														if (!value) return null;
														return (
															<div key={cat} className="flex items-center gap-2">
																<div className={`shrink-0 rounded-[2px] h-2.5 w-2.5 ${cfg.chartDotClass}`} />
																<span className="text-muted-foreground">{cat === "brand" ? "Your Brand" : cfg.label}</span>
																<span className="ml-auto font-mono tabular-nums">{value}%</span>
															</div>
														);
													})}
												</div>
												</div>
											);
										}}
									/>
								<Area dataKey="institutional" type="monotone" stackId="1" stroke="var(--color-institutional)" fill="var(--color-institutional)" fillOpacity={0.8} strokeWidth={0} />
								<Area dataKey="google" type="monotone" stackId="1" stroke="var(--color-google)" fill="var(--color-google)" fillOpacity={0.8} strokeWidth={0} />
								<Area dataKey="socialMedia" type="monotone" stackId="1" stroke="var(--color-socialMedia)" fill="var(--color-socialMedia)" fillOpacity={0.8} strokeWidth={0} />
								<Area dataKey="competitor" type="monotone" stackId="1" stroke="var(--color-competitor)" fill="var(--color-competitor)" fillOpacity={0.8} strokeWidth={0} />
								<Area dataKey="brand" type="monotone" stackId="1" stroke="var(--color-brand)" fill="var(--color-brand)" fillOpacity={0.8} strokeWidth={0} />
								</AreaChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>
			</section>

			{/* Section 3: Tracking Stats */}
			<section className="pt-4">
				<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
					{isLoadingSummary ? (
						<>
							<div className="flex items-center gap-2"><IconList className="h-4 w-4 flex-shrink-0" /><Skeleton className="h-4 w-28" /></div>
							<div className="flex items-center gap-2"><IconActivity className="h-4 w-4 flex-shrink-0" /><Skeleton className="h-4 w-32" /></div>
							<div className="flex items-center gap-2"><IconClock className="h-4 w-4 flex-shrink-0" /><Skeleton className="h-4 w-24" /></div>
							<div className="flex items-center gap-2"><IconRefresh className="h-4 w-4 flex-shrink-0" /><Skeleton className="h-4 w-24" /></div>
						</>
					) : (
						<>
							<StatWithTooltip
								icon={IconList}
								label="prompts tracked"
								value={totalPrompts.toLocaleString()}
								tooltip="Total number of unique prompts being monitored for AI visibility across ChatGPT, Claude, and Gemini."
							/>
							<StatWithTooltip
								icon={IconActivity}
								label="evaluations (30d)"
								value={totalRuns.toLocaleString()}
								tooltip="Total number of times we have evaluated prompts against LLMs in the last 30 days. Each prompt is evaluated multiple times across different AI models."
							/>
							<StatWithTooltip
								icon={IconClock}
								label="run frequency"
								value={formatRunFrequency(brand?.delayOverrideHours ?? DEFAULT_DELAY_HOURS)}
								tooltip={`Prompts are automatically evaluated every ${formatRunFrequency(brand?.delayOverrideHours ?? DEFAULT_DELAY_HOURS).replace("~", "")} on average to track changes in AI model responses over time.`}
							/>
							<StatWithTooltip
								icon={IconRefresh}
								label="last updated"
								value={formatRelativeTime(lastUpdatedAt)}
								tooltip={lastUpdatedAt
									? `The last prompts we evaluated for your brand were run on ${new Date(lastUpdatedAt).toLocaleString()}`
									: "No evaluations have been run yet."
								}
							/>
						</>
					)}
				</div>
			</section>
		</div>
	);
}
