import { IconActivity, IconArrowRight, IconClock, IconInfoCircle, IconList, IconRefresh } from "@tabler/icons-react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { labelForModelFilter } from "@workspace/config/model-filter";
import type { ClientConfig } from "@workspace/config/types";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { type ReactNode, useEffect } from "react";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { CompetitiveLandscape } from "@/components/overview/competitive-landscape";
import { HeadlineCard } from "@/components/overview/headline-card";
import { FilterSection, PageHeader } from "@/components/page-header";
import PromptWizard from "@/components/prompt-wizard";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import type { LandscapeMetric } from "@/lib/landscape";
import { describeTargetSchedule, type TrackedTarget } from "@/lib/model-filter";
import { METRIC_META, rankAmong } from "@/lib/overview-metrics";
import { setPersonProperties } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";

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
	head: pageHead({ description: "How AI answers talk about your brand and your competitors." }),
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

/** Mirrors the brand's active prompt count onto the PostHog person. */
function useReportedPromptCount(totalPrompts: number | undefined) {
	useEffect(() => {
		if (totalPrompts != null) setPersonProperties({ active_prompt_count: totalPrompts });
	}, [totalPrompts]);
}

const HEADLINES: LandscapeMetric[] = ["visibility", "share", "sentiment", "position"];

function DashboardPage() {
	const brandId = useBrandId();
	const { data: brand, isLoading: isLoadingBrand } = useBrand();
	const { model, lookback, tags } = useListFilters();
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;
	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const { data: summary, isLoading: isLoadingSummary } = useDashboardSummary(brand?.id, {
		lookback,
		model: modelParam,
		tags,
	});
	useReportedPromptCount(summary?.totalPrompts);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;
	// The footer reports what this brand actually runs, resolved server-side.
	const trackedTargets = brand?.trackedTargets ?? [];
	const loading = isLoadingBrand || isLoadingSummary;

	if (!isLoadingBrand && !brand?.onboarded) {
		return <ResearchBrandData brandId={brandId} clientConfig={clientConfig} />;
	}

	// No runs yet (and no filter narrowing them away): nothing to plot, so point at what to do next.
	if (!loading && summary?.totalRuns === 0 && !modelParam && tags.length === 0) {
		return (
			<AwaitingFirstEvaluation totalPrompts={summary.totalPrompts} hasPrompts={(brand?.prompts?.length ?? 0) > 0} />
		);
	}

	const landscape = summary?.landscape;
	const rankOf = (metric: LandscapeMetric) => {
		const values = landscape?.companies.map((c) => c.totals[metric]) ?? [];
		const own = landscape?.companies.find((c) => c.isBrand)?.totals[metric] ?? null;
		return rankAmong(own, values, METRIC_META[metric].lowerIsBetter);
	};

	return (
		<div className="flex flex-1 flex-col">
			<div className="m-auto flex w-full max-w-[1600px] flex-col gap-4 p-4">
				<PageHeader
					title="Overview"
					subtitle="How AI answers talk about your brand and your competitors."
					infoContent={
						<p>
							Every figure covers the selected period, models and tags. The change beside each number is from the start
							of the period to its end.
						</p>
					}
				>
					<FilterSection>
						<FilterBar
							availableTags={promptsSummary?.availableTags ?? []}
							trackedTargets={trackedTargets}
							showSearch={false}
							showModelSelector
						/>
					</FilterSection>
				</PageHeader>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
					{HEADLINES.map((metric) => (
						<HeadlineCard
							key={metric}
							metric={metric}
							card={summary?.cards[metric]}
							rank={rankOf(metric)}
							loading={loading}
						/>
					))}
				</div>

				<CompetitiveLandscape landscape={landscape} loading={loading} />

				<section className="pt-2">
					<TrackingStats
						loading={loading}
						totalPrompts={summary?.totalPrompts ?? 0}
						totalRuns={summary?.totalRuns ?? 0}
						lastUpdatedAt={summary?.lastUpdatedAt ?? null}
						delayHours={brand?.delayOverrideHours ?? clientConfig?.defaultDelayHours ?? 24}
						trackedTargets={trackedTargets}
					/>
				</section>
			</div>
		</div>
	);
}
