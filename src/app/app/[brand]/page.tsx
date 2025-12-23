"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
	IconArrowRight,
	IconEye,
	IconList,
	IconActivity,
	IconClock,
	IconInfoCircle,
	IconRefresh,
	IconLink
} from "@tabler/icons-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import PromptWizard from "@/components/prompt-wizard";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";

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

export default function AppPage({ params }: { params: Promise<{ brand: string }> }) {
	const [brandId, setBrandId] = useState<string>("");
	const { brand, isLoading: isLoadingBrand } = useBrand();
	const { dashboardSummary, isLoading: isLoadingSummary } = useDashboardSummary(brand?.id, "1m");

	// Get the brand ID from params
	useEffect(() => {
		params.then(({ brand }) => setBrandId(brand));
	}, [params]);

	const isLoading = isLoadingBrand || isLoadingSummary;

	if (isLoadingBrand) {
		return (
			<div className="flex flex-1 flex-col gap-4 p-4">
				<div className="grid gap-4 lg:grid-cols-4">
					<Skeleton className="h-[200px] rounded-xl" />
					<Skeleton className="h-[200px] rounded-xl lg:col-span-3" />
				</div>
				<Skeleton className="h-[200px] rounded-xl" />
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
						const redirectUrl = WHITE_LABEL_CONFIG.onboarding_redirect_url(brandId);
						if (redirectUrl) {
							window.location.href = redirectUrl;
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
	const visibilityTimeSeries = dashboardSummary?.visibilityTimeSeries || [];
	const citationTimeSeries = dashboardSummary?.citationTimeSeries || [];
	const lastUpdatedAt = dashboardSummary?.lastUpdatedAt || null;

	// Show placeholder if no evaluations yet
	const hasNoEvaluations = totalRuns === 0 && !isLoadingSummary;
	const hasEnabledPrompts = totalPrompts > 0;

	if (hasNoEvaluations) {
		// Determine which message to show based on prompts state
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
							<span className="font-semibold">{totalPrompts}</span>
						</div>
					)}
					<Button asChild variant="outline" className="w-full">
						<Link href={`/app/${brandId}/prompts/edit`}>
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
		brand: {
			label: "Your Brand",
			color: "#10b981", // emerald-500 (green)
		},
		competitor: {
			label: "Competitors",
			color: "#ef4444", // red-500
		},
		socialMedia: {
			label: "Social Media",
			color: "#8b5cf6", // violet-500 (purple)
		},
	};

	// Stat with tooltip helper
	const StatWithTooltip = ({ 
		icon: Icon, 
		label, 
		value, 
		tooltip 
	}: { 
		icon: typeof IconList; 
		label: string; 
		value: string | number; 
		tooltip: string;
	}) => (
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

	// Card title with info tooltip helper
	const CardTitleWithTooltip = ({ 
		title, 
		tooltip,
		className = ""
	}: { 
		title: string; 
		tooltip: string;
		className?: string;
	}) => (
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
						<Link href={`/app/${brandId}/prompts`}>
							View Prompts <IconArrowRight className="h-4 w-4 ml-1" />
						</Link>
					</Button>
				</div>

				<div className="grid gap-4 lg:grid-cols-4">
					{/* Hero Visibility Score */}
					<Card className={`shadow-none flex flex-col ${getVisibilityBgColor(averageVisibility)} ${getVisibilityBorderColor(averageVisibility)}`}>
						<CardHeader className="pb-2">
							<CardTitle className={`text-sm font-medium flex items-center gap-1.5 ${getVisibilityLabelColor(averageVisibility)}`}>
								Current Visibility
								<Tooltip>
									<TooltipTrigger asChild>
										<IconInfoCircle className={`h-3.5 w-3.5 cursor-help opacity-70`} />
									</TooltipTrigger>
									<TooltipContent className="max-w-xs text-sm font-normal">
										The percentage of AI responses to your prompts where your brand is mentioned. For prompts that do not contain your brand, the AI visibility is {nonBrandedVisibility}%.
									</TooltipContent>
								</Tooltip>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex-1 flex flex-col justify-center gap-4">
							<div className={`text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tight ${getVisibilityTextColor(averageVisibility)}`}>
								{isLoading ? <Skeleton className="h-20 w-36" /> : `${averageVisibility}%`}
							</div>
						</CardContent>
					</Card>

					{/* Visibility Chart */}
					<Card className="shadow-none lg:col-span-3 flex flex-col">
						<CardHeader className="pb-2">
							<CardTitleWithTooltip
								title="Visibility Trends (30d)"
								tooltip="AI visibility can change based on underlying modifications to AI models themselves, the prompts you track, or the websites AI scans before generating responses. This chart shows the 7-day rolling average of how often your brand is mentioned in AI responses for the prompts we are tracking."
							/>
						</CardHeader>
						<CardContent className="flex-1 min-h-[120px]">
							{isLoading ? (
								<Skeleton className="h-full w-full" />
							) : (
								<ChartContainer config={visibilityChartConfig} className="aspect-auto h-full w-full">
									<AreaChart data={visibilityTimeSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
											domain={[0, 100]}
											tickLine={false}
											axisLine={false}
											tickMargin={8}
											tickCount={4}
											tick={{ fontSize: 11 }}
											tickFormatter={(value) => `${value}%`}
										/>
										<ChartTooltip
											cursor={false}
											content={
												<ChartTooltipContent
													className="min-w-[12rem]"
													labelFormatter={(value) => {
														const [year, month, day] = value.split("-").map(Number);
														const date = new Date(year, month - 1, day);
														return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
													}}
												/>
											}
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
						<Link href={`/app/${brandId}/citations`}>
							View Citations <IconArrowRight className="h-4 w-4 ml-1" />
						</Link>
					</Button>
				</div>

				<Card className="shadow-none">
					<CardHeader className="pb-2">
						<CardTitleWithTooltip
							title="Citation Category Trends (30d)"
							tooltip="A website contained in the response to a prompt evaluated by AI is a citation. This chart tracks how types of cited websites (your brand website, competitor websites, social media) change over time over prompts we evaluate. Uncategorized websites are not included in this chart."
						/>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<Skeleton className="h-[140px] w-full" />
						) : (
							<ChartContainer config={citationsChartConfig} className="aspect-auto h-[140px] w-full">
								<AreaChart data={citationTimeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
									/>
									<ChartTooltip
										cursor={false}
										content={
											<ChartTooltipContent
												className="min-w-[10rem]"
												labelFormatter={(value) => {
													const [year, month, day] = value.split("-").map(Number);
													const date = new Date(year, month - 1, day);
													return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
												}}
											/>
										}
									/>
									<Area
										dataKey="socialMedia"
										type="monotone"
										stackId="1"
										stroke="var(--color-socialMedia)"
										fill="var(--color-socialMedia)"
										fillOpacity={0.8}
										strokeWidth={0}
									/>
									<Area
										dataKey="competitor"
										type="monotone"
										stackId="1"
										stroke="var(--color-competitor)"
										fill="var(--color-competitor)"
										fillOpacity={0.8}
										strokeWidth={0}
									/>
									<Area
										dataKey="brand"
										type="monotone"
										stackId="1"
										stroke="var(--color-brand)"
										fill="var(--color-brand)"
										fillOpacity={0.8}
										strokeWidth={0}
									/>
								</AreaChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>
			</section>

			{/* Section 3: Tracking Stats */}
			<section className="pt-4">
				<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
					<StatWithTooltip
						icon={IconList}
						label="prompts tracked"
						value={totalPrompts}
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
						value="~72h"
						tooltip="Prompts are automatically evaluated every 72 hours on average to track changes in AI model responses over time."
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
				</div>
			</section>
		</div>
	);
}
