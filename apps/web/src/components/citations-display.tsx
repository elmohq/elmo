
import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import { Input } from "@workspace/ui/components/input";
import { IconExternalLink, IconInfoCircle, IconSearch, IconPlus, IconArrowDownRight, IconSwitchHorizontal, IconChevronDown } from "@tabler/icons-react";
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
	brandName?: string;
	showStats?: boolean;
	maxDomains?: number;
	maxUrls?: number;
	days?: number;
}

const getCategoryLabel = (category: string) =>
	CATEGORY_CONFIG[category as CitationCategory]?.label ?? category;

const getCategoryColorClass = (category: string) =>
	CATEGORY_CONFIG[category as CitationCategory]?.badgeClass ?? "bg-gray-500/90 text-white";

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

const extractFilenameFromUrl = (url: string) => {
	try {
		const urlObj = new URL(url);
		const segments = urlObj.pathname.split("/").filter(Boolean);
		if (segments.length === 0) return urlObj.hostname.replace(/^www\./, "");
		return segments[segments.length - 1];
	} catch {
		return url;
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

const CATEGORY_TABS = [
	{ key: "all", label: "All" },
	{ key: "brand", label: "Brand" },
	{ key: "competitor", label: "Competitors" },
	{ key: "social_media", label: "Social Media" },
	{ key: "google", label: "Google" },
	{ key: "institutional", label: "Institutional" },
	{ key: "other", label: "Other" },
] as const;

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

export function CitationsDisplay({
	citationData,
	brandId,
	brandName,
	showStats = false,
	maxDomains = 15,
	maxUrls = 20,
	days = 7,
}: CitationsDisplayProps) {
	const [domainSearch, setDomainSearch] = useState("");
	const [urlSearch, setUrlSearch] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeType>("new_pages");
	const [changeTabExpanded, setChangeTabExpanded] = useState(false);

	if (citationData.totalCitations === 0) {
		return null;
	}

	const brandShare = citationData.totalCitations > 0
		? Math.round((citationData.brandCitations / citationData.totalCitations) * 100)
		: 0;

	const filteredDomains = useMemo(() => {
		let domains = citationData.domainDistribution;
		if (domainSearch) {
			const q = domainSearch.toLowerCase();
			domains = domains.filter((d) => d.domain.toLowerCase().includes(q));
		}
		return domains.slice(0, Math.max(maxDomains, 20));
	}, [citationData.domainDistribution, domainSearch, maxDomains]);

	const filteredUrls = useMemo(() => {
		let urls = citationData.specificUrls;
		if (selectedCategory !== "all") {
			urls = urls.filter((u) => u.category === selectedCategory);
		}
		if (urlSearch) {
			const q = urlSearch.toLowerCase();
			urls = urls.filter((u) =>
				u.url.toLowerCase().includes(q) ||
				(u.title?.toLowerCase().includes(q)) ||
				u.domain.toLowerCase().includes(q)
			);
		}
		return urls.slice(0, maxUrls);
	}, [citationData.specificUrls, selectedCategory, urlSearch, maxUrls]);

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

			{/* Top Cited Domains */}
			{filteredDomains.length > 0 && (
				<Card className="gap-4">
					<CardHeader>
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
							<div className="space-y-1 min-w-0">
								<CardTitle className="flex items-center gap-1.5">
									Top Cited Domains
									<Tooltip>
										<TooltipTrigger asChild>
											<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
										</TooltipTrigger>
										<TooltipContent className="max-w-xs text-sm font-normal">
											The most frequently cited domains across all prompt evaluations. Each domain is colored by its category (brand, competitor, etc.).
										</TooltipContent>
									</Tooltip>
								</CardTitle>
								<CardDescription>
									Which domains LLMs reference most when responding to your prompts
								</CardDescription>
							</div>
							<div className="relative w-full sm:w-48 shrink-0">
								<IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
								<Input
									placeholder="Search domains..."
									value={domainSearch}
									onChange={(e) => setDomainSearch(e.target.value)}
									className="h-8 pl-8 text-xs"
								/>
							</div>
						</div>
					</CardHeader>
					<Separator />
					<CardContent>
						<ProgressBarChart
							items={filteredDomains.slice(0, maxDomains).map((domain) => ({
								label: domain.domain,
								count: domain.count,
								category: domain.category || "other",
							}))}
							colorMapping={DOMAIN_CATEGORY_COLORS}
							percentageMode="max"
						/>
					</CardContent>
				</Card>
			)}

			{/* Top Cited URLs */}
			{citationData.specificUrls.length > 0 && (
				<Card className="gap-4">
					<CardHeader>
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
							<div className="space-y-1 min-w-0">
								<CardTitle className="flex items-center gap-1.5">
									Top Cited URLs
									<Tooltip>
										<TooltipTrigger asChild>
											<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
										</TooltipTrigger>
										<TooltipContent className="max-w-xs text-sm font-normal">
											<p className="mb-2">The specific pages most frequently cited by AI models. Filter by category to focus on brand, competitor, or other sources.</p>
											<p><strong>Competitor</strong> domains are only those in your {brandId ? <Link to="/app/$brand/settings/competitors" params={{ brand: brandId }} className="underline">tracked competitors list</Link> : "tracked competitors list"}.</p>
										</TooltipContent>
									</Tooltip>
								</CardTitle>
								<CardDescription>
									Individual pages cited by LLMs{citationData.brandCitations > 0 && brandName && (
										<> &mdash; {brandName} accounts for <strong>{brandShare}%</strong> of all citations</>
									)}
								</CardDescription>
							</div>
							<div className="relative w-full sm:w-48 shrink-0">
								<IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
								<Input
									placeholder="Search URLs..."
									value={urlSearch}
									onChange={(e) => setUrlSearch(e.target.value)}
									className="h-8 pl-8 text-xs"
								/>
							</div>
						</div>
					</CardHeader>
					<Separator />
					<CardContent>
						<UnderlineTabs
							tabs={CATEGORY_TABS}
							activeKey={selectedCategory}
							onSelect={setSelectedCategory}
						/>
						<div className="divide-y divide-border mt-1">
							{filteredUrls.map((citation) => {
								const displayUrl = formatUrlForDisplay(citation.url);
								const domainEndIndex = displayUrl.indexOf("/");
								const domainPart = domainEndIndex > 0 ? displayUrl.substring(0, domainEndIndex) : displayUrl;
								const pathPart = domainEndIndex > 0 ? displayUrl.substring(domainEndIndex) : "";

								return (
									<a
										key={citation.url}
										href={citation.url}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-start justify-between gap-3 py-3 group"
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2 mb-0.5">
												<Badge className={`text-[10px] px-1.5 py-0 h-[18px] border-0 shadow-none ${getCategoryColorClass(citation.category)}`}>
													{getCategoryLabel(citation.category)}
												</Badge>
												{citation.isNew && (
													<Badge className="text-[10px] px-1.5 py-0 h-[18px] border-0 shadow-none bg-green-100 text-green-700">NEW</Badge>
												)}
												<span className="text-sm font-medium truncate group-hover:underline">
													{citation.title || extractFilenameFromUrl(citation.url)}
												</span>
											</div>
											<div className="text-xs text-muted-foreground truncate">
												<span className="font-semibold">{domainPart}</span>
												{pathPart && <span>{pathPart}</span>}
											</div>
										</div>
										<div className="flex items-center gap-3 shrink-0 pt-0.5">
											{citation.avgPosition != null && (
												<Tooltip>
													<TooltipTrigger asChild>
														<span className="text-[11px] text-muted-foreground tabular-nums">avg {citation.avgPosition.toFixed(1)}</span>
													</TooltipTrigger>
													<TooltipContent className="text-xs">
														Average citation position (lower = cited earlier in the response)
													</TooltipContent>
												</Tooltip>
											)}
											<Tooltip>
												<TooltipTrigger asChild>
													<span className="text-sm font-semibold tabular-nums min-w-[2rem] text-right">
														{citation.count.toLocaleString()}
													</span>
												</TooltipTrigger>
												<TooltipContent className="text-xs">
													Total times this URL was cited across all prompt evaluations
												</TooltipContent>
											</Tooltip>
											<IconExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
										</div>
									</a>
								);
							})}
							{filteredUrls.length === 0 && (
								<p className="text-sm text-muted-foreground text-center py-4">
									No URLs match the current filters.
								</p>
							)}
						</div>
					</CardContent>
				</Card>
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
