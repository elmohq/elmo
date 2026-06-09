
import { useState, useMemo, } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import { IconExternalLink, IconInfoCircle, IconPlus, IconArrowDownRight, IconSwitchHorizontal, IconChevronDown, IconAlertTriangle } from "@tabler/icons-react";
import { ProgressBarChart, DOMAIN_CATEGORY_COLORS } from "@/components/progress-bar-chart";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@workspace/ui/components/chart";
import { type CitationCategory, CATEGORY_CONFIG } from "@/lib/domain-categories";

export interface CitationData {
	totalCitations: number;
	uniqueDomains: number;
	brandCitations: number;
	competitorCitations: number;
	socialMediaCitations: number;
	googleCitations?: number;
	institutionalCitations?: number;
	otherCitations: number;
	domainDistribution: {
		domain: string;
		count: number;
		category: CitationCategory;
		exampleTitle?: string;
		previousCount?: number;
		changePercent?: number | null;
	}[];
	specificUrls: {
		url: string;
		title?: string;
		domain: string;
		count: number;
		category: CitationCategory;
		avgPosition?: number | null;
		promptCount?: number;
		isNew?: boolean;
	}[];
	citationTimeSeries?: {
		date: string;
		brand: number;
		competitor: number;
		socialMedia: number;
		google: number;
		institutional: number;
		other: number;
	}[];
	previousBrandShare?: number | null;
	competitors?: Array<{ id: string; name: string; domains: string[] }>;
	competitorOnlyPrompts?: Array<{ id: string; value: string; competitorCitationCount: number; uniqueCompetitors: number }>;
	whatsChanged?: {
		newUrls: { url: string; domain: string; count: number; promptCount: number; category: CitationCategory }[];
		droppedUrls: { url: string; domain: string; previousCount: number; currentCount: number; category: CitationCategory }[];
		titleChanges: { url: string; domain: string; currentTitle: string; previousTitle: string; category: CitationCategory }[];
		newDomains: { domain: string; count: number; category: CitationCategory }[];
		droppedDomains: { domain: string; previousCount: number; category: CitationCategory }[];
	};
}

interface CitationsDisplayProps {
	citationData: CitationData;
	brandId?: string;
	showStats?: boolean;
	days?: number;
}

const formatUrlForDisplay = (url: string) => {
	let displayUrl = url.replace(/^https?:\/\//, "");
	displayUrl = displayUrl.replace(/^www\./, "");
	displayUrl = displayUrl.replace(/#:~:text=[^&]*/, "");
	if (displayUrl.endsWith("#")) displayUrl = displayUrl.slice(0, -1);
	const maxLength = 80;
	if (displayUrl.length > maxLength) {
		displayUrl = displayUrl.substring(0, maxLength) + "...";
	}
	return displayUrl;
};

function formatPeriodLabel(days: number): string {
	if (days === 1) return "24 hours";
	if (days === 7) return "week";
	if (days === 14) return "2 weeks";
	if (days === 30) return "month";
	if (days === 60) return "2 months";
	if (days === 90) return "3 months";
	return `${days} days`;
}

const extractSubreddit = (url: string): string | null => {
	try {
		const match = url.match(/reddit\.com\/r\/([^/?#]+)/i);
		return match ? `r/${match[1]}` : null;
	} catch {
		return null;
	}
};

type ChangeType = "new_pages" | "dropped_pages" | "title" | "new_domains" | "dropped_domains";

const CHANGE_TYPE_TABS: { key: ChangeType; label: string }[] = [
	{ key: "new_pages", label: "New Pages" },
	{ key: "dropped_pages", label: "Dropped Pages" },
	{ key: "title", label: "Title Changes" },
	{ key: "new_domains", label: "New Domains" },
	{ key: "dropped_domains", label: "Dropped Domains" },
];

const citationsChartConfig: ChartConfig = {
	brand: { label: "Your Brand", color: CATEGORY_CONFIG.brand.chartColor },
	competitor: { label: "Competitors", color: CATEGORY_CONFIG.competitor.chartColor },
	socialMedia: { label: "Social Media", color: CATEGORY_CONFIG.social_media.chartColor },
	google: { label: "Google", color: CATEGORY_CONFIG.google.chartColor },
	institutional: { label: "Institutional", color: CATEGORY_CONFIG.institutional.chartColor },
	other: { label: "Other", color: CATEGORY_CONFIG.other.chartColor },
};

function UnderlineTabs<T extends string>({
	tabs,
	activeKey,
	onSelect,
}: {
	tabs: readonly { key: T; label: string }[];
	activeKey: T;
	onSelect: (key: T) => void;
}) {
	return (
		<nav className="-mb-px flex gap-4 border-b border-border" aria-label="Tabs">
			{tabs.map(({ key, label }) => (
				<button
					key={key}
					type="button"
					onClick={() => onSelect(key)}
					className={`cursor-pointer whitespace-nowrap pb-2.5 text-xs font-medium transition-colors border-b-2 ${
						activeKey === key
							? "border-foreground text-foreground"
							: "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
					}`}
				>
					{label}
				</button>
			))}
		</nav>
	);
}

const OPPORTUNITY_TABS = [
	{ key: "content_gaps" as const, label: "Content Gaps" },
];

function OpportunitiesCard({
	prompts,
	brandId,
}: {
	prompts: Array<{ id: string; value: string; competitorCitationCount: number; uniqueCompetitors: number }>;
	brandId: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const PREVIEW_COUNT = 3;
	const visible = expanded ? prompts : prompts.slice(0, PREVIEW_COUNT);
	const remaining = prompts.length - PREVIEW_COUNT;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					Opportunities
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-sm font-normal">
							Actionable insights to improve your brand&apos;s presence in AI-generated responses.
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>
					Areas where you can improve your brand&apos;s citation presence
				</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent>
				<UnderlineTabs tabs={OPPORTUNITY_TABS} activeKey="content_gaps" onSelect={() => {}} />
				<div className="divide-y divide-border/50">
					{visible.map((prompt) => (
						<Link
							key={prompt.id}
							to="/app/$brand/prompts/$promptId"
							params={{ brand: brandId, promptId: prompt.id }}
							className="flex items-start gap-2.5 py-2 group"
						>
							<div className="shrink-0 mt-0.5">
								<IconAlertTriangle className="h-3.5 w-3.5 text-amber-500" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<span className="text-sm font-medium truncate text-foreground group-hover:underline">{prompt.value}</span>
								</div>
								<p className="text-xs text-muted-foreground mt-0.5">
									{prompt.uniqueCompetitors} {prompt.uniqueCompetitors === 1 ? "competitor" : "competitors"} cited{" "}
									{prompt.competitorCitationCount} {prompt.competitorCitationCount === 1 ? "time" : "times"} &mdash; your
									brand cited 0 times
								</p>
							</div>
						</Link>
					))}
				</div>
				{remaining > 0 && !expanded && (
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="mt-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-3 py-1.5 rounded-md border border-border hover:bg-muted/60 transition-colors"
					>
						Show {remaining} more
					</button>
				)}
			</CardContent>
		</Card>
	);
}

export function CitationsDisplay({
	citationData,
	brandId,
	showStats = false,
	days = 7,
}: CitationsDisplayProps) {
	const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeType>("new_pages");
	const [changeTabExpanded, setChangeTabExpanded] = useState(false);

	const subredditData = useMemo(() => {
		const droppedUrlSet = new Set(
			citationData.whatsChanged?.droppedUrls
				.filter((u) => u.domain.includes("reddit.com"))
				.map((u) => extractSubreddit(u.url))
				.filter(Boolean) ?? [],
		);

		const map = new Map<string, {
			count: number;
			newPages: number;
			totalPages: number;
			urls: { url: string; title?: string; count: number; isNew?: boolean }[];
		}>();
		for (const u of citationData.specificUrls) {
			if (!u.domain.includes("reddit.com")) continue;
			const sub = extractSubreddit(u.url);
			if (!sub) continue;
			const existing = map.get(sub);
			if (existing) {
				existing.count += u.count;
				existing.totalPages += 1;
				if (u.isNew) existing.newPages += 1;
				existing.urls.push({ url: u.url, title: u.title, count: u.count, isNew: u.isNew });
			} else {
				map.set(sub, {
					count: u.count,
					newPages: u.isNew ? 1 : 0,
					totalPages: 1,
					urls: [{ url: u.url, title: u.title, count: u.count, isNew: u.isNew }],
				});
			}
		}

		return Array.from(map.entries())
			.map(([name, data]) => ({
				name,
				count: data.count,
				newPages: data.newPages,
				totalPages: data.totalPages,
				allNew: data.newPages === data.totalPages,
				hasDropped: droppedUrlSet.has(name),
				urls: data.urls.sort((a, b) => b.count - a.count),
			}))
			.sort((a, b) => b.count - a.count);
	}, [citationData.specificUrls, citationData.whatsChanged]);
	const [expandedSubreddit, setExpandedSubreddit] = useState<string | null>(null);
	const [showAllSubreddits, setShowAllSubreddits] = useState(false);

	const whatsChanged = citationData.whatsChanged;
	const allChanges = useMemo(() => {
		if (!whatsChanged) return [];
		return [
			...whatsChanged.newUrls.map((u) => ({ type: "new_pages" as const, ...u })),
			...whatsChanged.droppedUrls.map((u) => ({ type: "dropped_pages" as const, ...u })),
			...whatsChanged.titleChanges.map((u) => ({ type: "title" as const, ...u })),
			...whatsChanged.newDomains.map((d) => ({ type: "new_domains" as const, ...d })),
			...whatsChanged.droppedDomains.map((d) => ({ type: "dropped_domains" as const, ...d })),
		];
	}, [whatsChanged]);

	const filteredChanges = useMemo(() => {
		return allChanges.filter((c) => c.type === changeTypeFilter);
	}, [allChanges, changeTypeFilter]);

	const CHANGES_PREVIEW_COUNT = 3;
	const visibleChanges = changeTabExpanded ? filteredChanges : filteredChanges.slice(0, CHANGES_PREVIEW_COUNT);
	const totalChanges = allChanges.length;
	const brandShare =
		citationData.totalCitations > 0 ? Math.round((citationData.brandCitations / citationData.totalCitations) * 100) : 0;

	if (citationData.totalCitations === 0) {
		return null;
	}

	return (
		<>
			{/* Stats Cards */}
			{showStats && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<div className="md:col-span-2 lg:col-span-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-4">
						<Card className="flex flex-col">
							<CardHeader className="gap-0">
								<CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
									Brand Citation Share
									<Tooltip>
										<TooltipTrigger asChild>
											<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
										</TooltipTrigger>
										<TooltipContent className="max-w-xs text-sm font-normal">
											The percentage of all citations that link to your brand&apos;s domain. A higher share means AI models are more likely to reference your content.
										</TooltipContent>
									</Tooltip>
								</CardTitle>
							</CardHeader>
							<CardContent className="flex-1 flex items-center">
								<div className="text-2xl sm:text-3xl lg:text-4xl font-bold">{brandShare}%</div>
							</CardContent>
						</Card>
						<Card className="flex flex-col">
							<CardHeader className="gap-0">
								<CardTitle className="text-sm font-medium text-muted-foreground">Unique Domains</CardTitle>
							</CardHeader>
							<CardContent className="flex-1 flex items-center">
								<div className="text-2xl sm:text-3xl lg:text-4xl font-bold">{citationData.uniqueDomains.toLocaleString()}</div>
							</CardContent>
						</Card>
						<Card className="flex flex-col">
							<CardHeader className="gap-0">
								<CardTitle className="text-sm font-medium text-muted-foreground">Total Citations</CardTitle>
							</CardHeader>
							<CardContent className="flex-1 flex items-center">
								<div className="text-2xl sm:text-3xl lg:text-4xl font-bold">{citationData.totalCitations.toLocaleString()}</div>
							</CardContent>
						</Card>
					</div>

					<Card className="md:col-span-2 lg:col-span-3 flex flex-col">
						<CardHeader className="gap-0">
							<CardTitle className="flex items-center gap-1.5">
								Citations by Domain Type
								<Tooltip>
									<TooltipTrigger asChild>
										<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
									</TooltipTrigger>
									<TooltipContent className="max-w-xs text-sm font-normal">
										<p className="mb-2"><strong>Competitor</strong> domains are only those you&apos;ve added to your {brandId ? <Link to="/app/$brand/settings/competitors" params={{ brand: brandId }} className="underline">competitors list</Link> : "competitors list"}.</p>
										<p>If you see a competitor in &quot;Other&quot;, consider adding them to your list for better tracking.</p>
									</TooltipContent>
								</Tooltip>
							</CardTitle>
						</CardHeader>
						<Separator />
					<CardContent className="flex-1 flex flex-col pb-1">
						<ProgressBarChart
								items={[
									{ label: "Brand", count: citationData.brandCitations, category: "brand", tooltip: "Citations linking to your brand's own domain" },
									...[
										{ label: "Competitor", count: citationData.competitorCitations, category: "competitor", tooltip: "Citations linking to domains in your tracked competitors list" },
										{ label: "Social Media", count: citationData.socialMediaCitations, category: "social_media", tooltip: "Citations linking to social platforms like Reddit, YouTube, LinkedIn, X, etc." },
										{ label: "Google", count: citationData.googleCitations ?? 0, category: "google", tooltip: "Citations linking to Google-owned properties (Search, Support, Maps, Cloud, etc.)" },
										{ label: "Institutional", count: citationData.institutionalCitations ?? 0, category: "institutional", tooltip: "Citations linking to .org, .edu, .gov, and other institutional domains" },
									].sort((a, b) => b.count - a.count),
									{ label: "Other", count: citationData.otherCitations, category: "other", tooltip: "All other cited domains not matching the above categories" },
								]}
								colorMapping={DOMAIN_CATEGORY_COLORS}
								percentageMode="total"
								fillHeight
							/>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Citation Trends Chart */}
			{citationData.citationTimeSeries && citationData.citationTimeSeries.length > 0 && (
				<Card>
					<CardHeader className="gap-0 pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-1.5">
							Citation Category Trends
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-sm font-normal">
									Distribution of citations by category over time, shown as a percentage of all citations each day. Data is smoothed to account for staggered prompt schedules.
								</TooltipContent>
							</Tooltip>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ChartContainer config={citationsChartConfig} className="aspect-auto h-[180px] w-full">
							<AreaChart data={citationData.citationTimeSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
										const dp = payload[0]?.payload as NonNullable<CitationData["citationTimeSeries"]>[0];
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
													const value = dp?.[key as keyof typeof dp] as number | undefined;
													if (!value) return null;
													return (
														<div key={cat} className="flex items-center gap-2">
															<div className={`shrink-0 rounded-[2px] h-2.5 w-2.5 ${cfg.chartDotClass}`} />
															<span className="text-muted-foreground">{cfg.label}</span>
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
					</CardContent>
				</Card>
			)}

			{/* Recent Changes */}
			{totalChanges > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5">
							Recent Changes
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-sm font-normal">
									Compares this {formatPeriodLabel(days)} with the {formatPeriodLabel(days)} before it. Shows new and dropped pages, title changes, and new and dropped domains.
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>
							How AI citations have shifted over the past {formatPeriodLabel(days)}
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent>
						<UnderlineTabs
							tabs={CHANGE_TYPE_TABS}
							activeKey={changeTypeFilter}
							onSelect={(key) => { setChangeTypeFilter(key); setChangeTabExpanded(false); }}
						/>
						<div className="divide-y divide-border/50">
							{visibleChanges.map((change) => {
								const isDomainChange = change.type === "new_domains" || change.type === "dropped_domains";
								const rawUrl = "url" in change ? (change.url as string) : undefined;
								const domain = "domain" in change ? (change.domain as string) : undefined;
								const url = rawUrl ?? (isDomainChange && domain ? `https://${domain}` : undefined);
								const displayLabel = isDomainChange ? domain ?? "" : rawUrl ? formatUrlForDisplay(rawUrl) : "";
								const key = isDomainChange ? `${change.type}-${domain}` : `${change.type}-${url ?? ""}`;

								const icon = (change.type === "new_pages" || change.type === "new_domains")
									? <IconPlus className="h-3.5 w-3.5 text-green-600" />
									: (change.type === "dropped_pages" || change.type === "dropped_domains")
										? <IconArrowDownRight className="h-3.5 w-3.5 text-red-600" />
										: <IconSwitchHorizontal className="h-3.5 w-3.5 text-amber-600" />;

								let description: React.ReactNode = null;
								if (change.type === "new_pages" && "promptCount" in change) {
									description = `0 → ${change.count} citations across ${change.promptCount} prompt${change.promptCount !== 1 ? "s" : ""}`;
								} else if (change.type === "dropped_pages" && "previousCount" in change) {
									description = `${change.previousCount} → ${change.currentCount} citations`;
								} else if (change.type === "title" && "currentTitle" in change && "previousTitle" in change) {
									description = (
										<>
											<span className="line-through opacity-60">{change.previousTitle}</span>
											{" → "}
											<span className="font-medium text-foreground">{change.currentTitle}</span>
										</>
									);
								} else if (change.type === "new_domains" && "count" in change) {
									description = `${change.count} citation${change.count !== 1 ? "s" : ""} in the current period`;
								} else if (change.type === "dropped_domains" && "previousCount" in change) {
									description = `${change.previousCount} citation${change.previousCount !== 1 ? "s" : ""} last period, none now`;
								}

								const inner = (
									<>
										<div className="shrink-0 mt-0.5">{icon}</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5">
												<span className={`text-sm font-medium truncate text-foreground${url ? " group-hover:underline" : ""}`}>{displayLabel}</span>
												{url && <IconExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
											</div>
											{description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
										</div>
									</>
								);

								return (
									<a
										key={key}
										href={url}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-start gap-2.5 py-2 group"
									>
										{inner}
									</a>
								);
							})}
							{visibleChanges.length === 0 && (
								<p className="text-sm text-muted-foreground text-center py-4">
									No {CHANGE_TYPE_TABS.find((t) => t.key === changeTypeFilter)?.label.toLowerCase() ?? changeTypeFilter} changes in this period.
								</p>
							)}
						</div>
						{filteredChanges.length > CHANGES_PREVIEW_COUNT && !changeTabExpanded && (
							<button
								onClick={() => setChangeTabExpanded(true)}
								className="mt-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-3 py-1.5 rounded-md border border-border hover:bg-muted/60 transition-colors"
							>
								Show {filteredChanges.length - CHANGES_PREVIEW_COUNT} more
							</button>
						)}
					</CardContent>
				</Card>
			)}

			{/* Opportunities */}
			{citationData.competitorOnlyPrompts && citationData.competitorOnlyPrompts.length > 0 && brandId && (
				<OpportunitiesCard
					prompts={citationData.competitorOnlyPrompts}
					brandId={brandId}
				/>
			)}

			{/* Top Cited Subreddits */}
			{subredditData.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5">
							Top Cited Subreddits
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-sm font-normal">
									Reddit communities most frequently cited by AI models. Extracted from all reddit.com URLs in your citation data.
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>
							Which subreddits AI models reference when answering your prompts
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent>
						<div className="divide-y divide-border/50">
							{(showAllSubreddits ? subredditData : subredditData.slice(0, 5)).map((sub) => {
								const isExpanded = expandedSubreddit === sub.name;
								return (
									<div key={sub.name}>
										<div className="flex items-center justify-between py-2">
											<button
												type="button"
												onClick={() => setExpandedSubreddit(isExpanded ? null : sub.name)}
												className="flex items-center gap-1.5 min-w-0 cursor-pointer group"
											>
												<IconChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
												<span className="text-sm font-medium text-foreground group-hover:underline truncate">{sub.name}</span>
												{sub.allNew && (
													<Badge className="text-[10px] px-1.5 py-0 h-[18px] border-0 shadow-none bg-green-100 text-green-700">NEW</Badge>
												)}
												{!sub.allNew && sub.newPages > 0 && (
													<span className="text-[10px] text-green-600 whitespace-nowrap">+{sub.newPages} new</span>
												)}
												{sub.hasDropped && (
													<span className="text-[10px] text-red-500 whitespace-nowrap">some dropped</span>
												)}
											</button>
											<div className="flex items-center gap-2 shrink-0 ml-3">
												<span className="text-sm font-semibold tabular-nums">
													{sub.count.toLocaleString()}
												</span>
												<a
													href={`https://reddit.com/${sub.name}`}
													target="_blank"
													rel="noopener noreferrer"
													onClick={(e) => e.stopPropagation()}
													className="text-muted-foreground hover:text-foreground transition-colors"
												>
													<IconExternalLink className="h-3.5 w-3.5" />
												</a>
											</div>
										</div>
										{isExpanded && sub.urls.length > 0 && (
											<div className="pl-5 pb-2 space-y-0.5">
												{sub.urls.map((u) => (
													<a
														key={u.url}
														href={u.url}
														target="_blank"
														rel="noopener noreferrer"
														className="flex items-center justify-between py-1 group text-xs"
													>
														<span className="text-muted-foreground group-hover:text-foreground group-hover:underline truncate min-w-0 flex items-center gap-1.5">
															{u.title || formatUrlForDisplay(u.url)}
															{u.isNew && <Badge className="text-[9px] px-1 py-0 h-[14px] border-0 shadow-none bg-green-100 text-green-700 shrink-0">NEW</Badge>}
														</span>
														<span className="tabular-nums text-muted-foreground shrink-0 ml-3">{u.count.toLocaleString()}</span>
													</a>
												))}
											</div>
										)}
									</div>
								);
							})}
						</div>
						{subredditData.length > 5 && !showAllSubreddits && (
							<button
								onClick={() => setShowAllSubreddits(true)}
								className="mt-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-3 py-1.5 rounded-md border border-border hover:bg-muted/60 transition-colors"
							>
								Show {subredditData.length - 5} more
							</button>
						)}
					</CardContent>
				</Card>
			)}
		</>
	);
}
