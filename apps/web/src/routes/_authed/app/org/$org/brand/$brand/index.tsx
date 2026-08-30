import {
	IconActivity,
	IconArrowRight,
	IconClock,
	IconEye,
	IconInfoCircle,
	IconList,
	IconRefresh,
	IconSpeakerphone,
} from "@tabler/icons-react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { type ReactNode, useEffect } from "react";
import PromptWizard from "@/components/prompt-wizard";
import { TrendChart, type TrendPoint } from "@/components/trend-chart";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import { describeTargetSchedule, labelForModelFilter, type TrackedTarget } from "@/lib/model-filter";
import { setPersonProperties } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";

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

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/")({
	staticData: { crumb: "Overview" },
	head: pageHead({ description: "Dashboard overview of AI visibility and citations." }),
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
	tooltip: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={<div className="flex items-center gap-2 cursor-help" />}>
				<Icon className="h-4 w-4 flex-shrink-0" />
				<span>
					<span className="font-semibold text-foreground">{value}</span> {label}
				</span>
				<IconInfoCircle className="h-3.5 w-3.5 opacity-50" />
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
	/** Absent while the figures it would quote are still loading. */
	tooltip?: string;
	className?: string;
}) {
	return (
		<CardTitle className={`text-sm font-medium flex items-center gap-1.5 ${className}`}>
			{title}
			{tooltip ? (
				<Tooltip>
					<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
					<TooltipContent className="max-w-xs text-sm font-normal">{tooltip}</TooltipContent>
				</Tooltip>
			) : (
				<IconInfoCircle className="h-3.5 w-3.5 opacity-70" />
			)}
		</CardTitle>
	);
}

/**
 * One dashboard band: the headline number beside the 30-day line it is the
 * latest point of. Renders its own skeletons, so the loading dashboard is the
 * same tree as the loaded one rather than a second copy of this markup.
 */
function TrendSection({
	icon: Icon,
	title,
	linkTo,
	linkLabel,
	chartTitle,
	chartLabel,
	tooltip,
	value,
	series,
	loading,
}: {
	icon: typeof IconEye;
	title: string;
	linkTo: "/app/org/$org/brand/$brand/visibility" | "/app/org/$org/brand/$brand/share-of-voice";
	linkLabel: string;
	chartTitle: string;
	chartLabel: string;
	tooltip?: string;
	value: number | null;
	series: TrendPoint[];
	loading: boolean;
}) {
	const params = useBrandParams();
	const heroTone = value === null ? "" : `${getVisibilityBgColor(value)} ${getVisibilityBorderColor(value)}`;
	return (
		<section className="space-y-2">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold flex items-center gap-2">
					<Icon className="h-5 w-5 text-muted-foreground" />
					{title}
				</h2>
				<Link
					to={linkTo}
					params={params}
					className={buttonVariants({ variant: "ghost", size: "sm", className: "h-8" })}
				>
					{linkLabel} <IconArrowRight className="h-4 w-4 ml-1" />
				</Link>
			</div>

			<div className="grid gap-4 lg:grid-cols-4">
				<Card className={`shadow-none flex flex-col gap-3 py-4 ${heroTone}`}>
					<HeroStat value={value} loading={loading} />
				</Card>
				<Card className="shadow-none lg:col-span-3 flex flex-col gap-3 py-4">
					<CardHeader className="border-b border-dotted pb-2!">
						<CardTitleWithTooltip title={chartTitle} tooltip={tooltip} />
					</CardHeader>
					<CardContent className="flex-1 min-h-[100px]">
						{loading ? (
							<Skeleton className="h-full w-full" />
						) : (
							<TrendChart data={series} label={chartLabel} color="#2563eb" />
						)}
					</CardContent>
				</Card>
			</div>
		</section>
	);
}

const STAT_PLACEHOLDERS = [
	{ label: "prompts tracked", icon: IconList },
	{ label: "evaluations", icon: IconActivity },
	{ label: "run frequency", icon: IconClock },
	{ label: "last updated", icon: IconRefresh },
];

function TrackingStats({
	loading,
	totalPrompts,
	totalRuns,
	lastUpdatedAt,
	delayHours,
	trackedTargets,
}: {
	loading: boolean;
	totalPrompts: number;
	totalRuns: number;
	lastUpdatedAt: string | null;
	delayHours: number;
	trackedTargets: TrackedTarget[];
}) {
	if (loading) {
		return (
			<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
				{STAT_PLACEHOLDERS.map(({ label, icon: Icon }) => (
					<div key={label} className="flex items-center gap-2">
						<Icon className="h-4 w-4 flex-shrink-0" />
						<Skeleton className="h-4 w-28" />
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
			<StatWithTooltip
				icon={IconList}
				label="prompts tracked"
				value={totalPrompts.toLocaleString()}
				tooltip={
					trackedTargets.length > 0 ? (
						<>
							<p>Prompts monitored for AI visibility, each evaluated on:</p>
							<ul className="mt-1 space-y-0.5">
								{trackedTargets.map((target) => (
									<li key={target.value}>{labelForModelFilter(target.value)}</li>
								))}
							</ul>
						</>
					) : (
						"Prompts monitored for AI visibility. No platforms are configured for this brand yet."
					)
				}
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
				value={formatRunFrequency(delayHours)}
				tooltip={
					trackedTargets.length > 0 ? (
						<>
							{/* One rate for the brand is a summary, not the truth: a
							    grounded call samples far less often than a scraped one,
							    and self-hosted repeats every sample. */}
							<p>How often each platform is sampled:</p>
							<ul className="mt-1 space-y-0.5">
								{trackedTargets.map((target) => (
									<li key={target.value}>{describeTargetSchedule(target)}</li>
								))}
							</ul>
						</>
					) : (
						"No platforms are configured for this brand yet."
					)
				}
			/>
			<StatWithTooltip
				icon={IconRefresh}
				label="last updated"
				value={formatRelativeTime(lastUpdatedAt)}
				tooltip={
					lastUpdatedAt
						? `The last prompts we evaluated for your brand were run on ${new Date(lastUpdatedAt).toLocaleString()}`
						: "No evaluations have been run yet."
				}
			/>
		</div>
	);
}

/**
 * Shown until the first evaluation lands. What to do next depends on whether
 * any prompt is configured, and whether any of them are enabled.
 */
function AwaitingFirstEvaluation({ totalPrompts, hasPrompts }: { totalPrompts: number; hasPrompts: boolean }) {
	const params = useBrandParams();
	const hasEnabledPrompts = totalPrompts > 0;
	const message = hasEnabledPrompts
		? "You are ready to track your AI visibility. We're currently running the first evaluation against AI models. This usually takes a few minutes."
		: hasPrompts
			? "You have prompts configured but none are currently enabled. Add or enable some prompts to start tracking your AI visibility."
			: "Set up prompts to start tracking your AI visibility. Once configured, we'll evaluate them against AI models automatically.";

	return (
		<div className="flex flex-1 flex-col items-center justify-center p-8 max-w-xl mx-auto text-center">
			<div className="rounded-full bg-muted p-4 mb-6">
				<IconClock className="h-10 w-10 text-muted-foreground" />
			</div>
			<h2 className="text-2xl font-bold mb-3">{hasEnabledPrompts ? "Waiting for First Evaluation" : "No Data Yet"}</h2>
			<p className="text-muted-foreground mb-6 text-balance">{message}</p>
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
				<Link
					to="/app/org/$org/brand/$brand/settings/prompts"
					params={params}
					className={buttonVariants({ variant: "outline", className: "w-full" })}
				>
					{hasEnabledPrompts ? "View Your Prompts" : hasPrompts ? "Edit Prompts" : "Set Up Prompts"}{" "}
					<IconArrowRight className="h-4 w-4 ml-1" />
				</Link>
			</div>
			{hasEnabledPrompts && (
				<p className="text-xs text-muted-foreground mt-6">
					Refresh this page in a few minutes to see your AI visibility data.
				</p>
			)}
		</div>
	);
}

function ResearchBrandData({ brandId, clientConfig }: { brandId: string; clientConfig?: ClientConfig }) {
	return (
		<div className="space-y-6 max-w-2xl p-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">Research Brand Data</h2>
				<p className="text-muted-foreground text-balance">
					We will analyze your website and find the best generative AI prompts to track. This process may take a couple
					of minutes.
				</p>
			</div>
			<PromptWizard
				onComplete={() => {
					const template = clientConfig?.branding.onboardingRedirectUrlTemplate;
					if (template) window.location.href = template.replace("{brandId}", brandId);
				}}
			/>
		</div>
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
				{loading ? <Skeleton className="h-16 w-32" /> : value === null ? "—" : `${value}%`}
			</div>
		</CardContent>
	);
}

function DashboardPage() {
	const { brandId } = Route.useRouteContext();
	const { brand, isLoading: isLoadingBrand } = useBrand();
	// The footer reports what this brand actually runs, resolved server-side.
	const trackedTargets = brand?.trackedTargets ?? [];
	const { dashboardSummary, isLoading: isLoadingSummary } = useDashboardSummary(brand?.id, "1m");
	const { data: sovData, isLoading: isLoadingSov } = useShareOfVoice(brand?.id, { lookback: "1m" });
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;

	useEffect(() => {
		if (dashboardSummary?.totalPrompts != null) {
			setPersonProperties({ active_prompt_count: dashboardSummary.totalPrompts });
		}
	}, [dashboardSummary?.totalPrompts]);

	const totalRuns = dashboardSummary?.totalRuns || 0;
	const totalPrompts = dashboardSummary?.totalPrompts || 0;
	const visibilityTimeSeries = dashboardSummary?.visibilityTimeSeries || [];
	const sovTimeSeries = sovData?.shareTimeSeries ?? [];
	const loadingVisibility = isLoadingBrand || isLoadingSummary;
	const loadingSov = isLoadingBrand || isLoadingSov;
	// The tooltips quote live figures, so they stay off until those have loaded.
	const visibilityTooltip = loadingVisibility
		? undefined
		: `The percentage of AI answers to your prompts that mention your brand — the big number is the latest point on this line. For prompts that don't name your brand, it's ${dashboardSummary?.nonBrandedVisibility || 0}%. Visibility shifts as AI models, the prompts you track, or the sites AI scans change; the line is smoothed for staggered prompt schedules.`;
	const sovTooltip = loadingSov
		? undefined
		: "Your brand's share of all brand and competitor mentions across the AI answers to your prompts — the big number is the latest point on this line. It shifts as AI models change, as you and competitors publish, or as the sites AI scans move; the line is smoothed for staggered prompt schedules.";

	if (!isLoadingBrand && !brand?.onboarded) {
		return <ResearchBrandData brandId={brandId} clientConfig={clientConfig} />;
	}

	// No runs yet: the dashboard has nothing to plot, so point at what to do next.
	if (!isLoadingBrand && !isLoadingSummary && totalRuns === 0) {
		return <AwaitingFirstEvaluation totalPrompts={totalPrompts} hasPrompts={(brand?.prompts?.length ?? 0) > 0} />;
	}

	return (
		<div className="flex flex-1 flex-col">
			<div className="m-auto flex w-full max-w-[1600px] flex-col gap-3 p-4">
				<TrendSection
					icon={IconEye}
					title="AI Visibility"
					linkTo="/app/org/$org/brand/$brand/visibility"
					linkLabel="View Visibility"
					chartTitle="Visibility Trends (30d)"
					chartLabel="AI Visibility (7d avg)"
					tooltip={visibilityTooltip}
					// "Current" = the latest plotted point, so the hero number always
					// matches the right end of the chart beside it (rather than the
					// whole-window average).
					value={lastValue(visibilityTimeSeries, "overall")}
					series={visibilityTimeSeries.map((p) => ({ date: p.date, value: p.overall }))}
					loading={loadingVisibility}
				/>

				<TrendSection
					icon={IconSpeakerphone}
					title="Share of Voice"
					linkTo="/app/org/$org/brand/$brand/share-of-voice"
					linkLabel="View Share of Voice"
					chartTitle="Share of Voice Trends (30d)"
					chartLabel="Share of Voice"
					tooltip={sovTooltip}
					value={lastValue(sovTimeSeries, "share")}
					series={sovTimeSeries.map((p) => ({ date: p.date, value: p.share }))}
					loading={loadingSov}
				/>

				<section className="pt-2">
					<TrackingStats
						loading={loadingVisibility}
						totalPrompts={totalPrompts}
						totalRuns={totalRuns}
						lastUpdatedAt={dashboardSummary?.lastUpdatedAt || null}
						delayHours={brand?.delayOverrideHours ?? clientConfig?.defaultDelayHours ?? 24}
						trackedTargets={trackedTargets}
					/>
				</section>
			</div>
		</div>
	);
}
