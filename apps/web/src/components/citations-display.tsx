
import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { IconExternalLink, IconInfoCircle, IconSearch, IconPlus, IconArrowDownRight, IconSwitchHorizontal, IconChevronDown, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import { Loader2 } from "lucide-react";
import { ProgressBarChart, DOMAIN_CATEGORY_COLORS } from "@/components/progress-bar-chart";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@workspace/ui/components/popover";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@workspace/ui/components/chart";
import {
	type CitationCategory,
	type CitationPageType,
	CATEGORY_CONFIG,
	CITATION_CATEGORIES,
	PAGE_TYPE_CONFIG,
	PAGE_TYPE_COLORS,
} from "@/lib/domain-categories";
import * as Sentry from "@sentry/tanstackstart-react";
import { addDomainToBrandFn, addDomainToCompetitorFn, createCompetitorFromDomainFn } from "@/server/brands";

export interface GoogleProductRow {
	name: string;
	count: number;
	attribution: "brand" | "competitor" | "other";
	competitorName?: string;
	prompts: { id: string; value: string; count: number }[];
	urls: { url: string; count: number }[];
}
export interface GoogleQueryRow {
	query: string;
	count: number;
	prompts: { id: string; value: string; count: number }[];
}
export interface GoogleModuleData {
	shopping: { totalCitations: number; brandCount: number; competitorCount: number; products: GoogleProductRow[] };
	search: { totalCitations: number; queries: GoogleQueryRow[] };
}

export interface CitationData {
	totalCitations: number;
	uniqueDomains: number;
	categoryCounts: Record<CitationCategory, number>;
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
		pageType?: CitationPageType;
		avgPosition?: number | null;
		promptCount?: number;
		isNew?: boolean;
	}[];
	pageTypeDistribution?: { pageType: CitationPageType; count: number }[];
	googleModule?: GoogleModuleData;
	citationTimeSeries?: Array<{ date: string } & Partial<Record<CitationCategory, number>>>;
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
	brandName?: string;
	showStats?: boolean;
	maxDomains?: number;
	maxUrls?: number;
	days?: number;
	onCompetitorAdded?: () => void;
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

const CATEGORY_TABS: { key: string; label: string }[] = [
	{ key: "all", label: "All" },
	...CITATION_CATEGORIES.map((c) => ({ key: c as string, label: CATEGORY_CONFIG[c].label })),
];

const CATEGORY_TOOLTIPS: Record<CitationCategory, string> = {
	brand: "Citations linking to your brand's own domain",
	competitor: "Citations linking to domains in your tracked competitors list",
	editorial: "News outlets, trade press, magazines, and blogs",
	reviews: "Review, comparison, and vendor-listing sites (G2, Capterra, Trustpilot, etc.)",
	ecommerce: "Retailers, marketplaces, and storefront/product pages (Amazon, Sephora, Ulta, etc.)",
	social: "Social platforms and community/Q&A sites (Reddit, LinkedIn, YouTube, Quora, Stack Overflow, etc.)",
	pr: "Press-release distribution wires (PR Newswire, Business Wire, etc.)",
	reference: "Reference and structured-knowledge sites (Wikipedia, Crunchbase, IMDb, etc.)",
	institutional: "Government, education, research, and nonprofit institutions (.gov, .edu, .org)",
	google: "Other Google-owned properties (Maps, Support, etc.). Google AI Mode search & shopping are broken out separately.",
	other: "All other cited domains not matching the above categories",
};

// The trend chart folds the 10 categories into 5 primary bands + "Other sources"
// to stay legible (and to keep Google AI Mode surfaces, which live in the Google
// module, from showing as their own band).
const TREND_PRIMARY: CitationCategory[] = ["brand", "competitor", "editorial", "reviews", "social"];
const TREND_BANDS: { key: string; label: string; dotClass: string }[] = [
	...TREND_PRIMARY.map((c) => ({ key: c as string, label: CATEGORY_CONFIG[c].label, dotClass: CATEGORY_CONFIG[c].chartDotClass })),
	{ key: "otherSources", label: "Other sources", dotClass: CATEGORY_CONFIG.other.chartDotClass },
];

const citationsChartConfig: ChartConfig = {
	...Object.fromEntries(TREND_PRIMARY.map((c) => [c, { label: CATEGORY_CONFIG[c].label, color: CATEGORY_CONFIG[c].chartColor }])),
	otherSources: { label: "Other sources", color: CATEGORY_CONFIG.other.chartColor },
};

const attributionDotClass = (a: "brand" | "competitor" | "other") =>
	a === "brand" ? "bg-emerald-500" : a === "competitor" ? "bg-red-500" : "bg-gray-400";

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

function TrackDomainPopover({
	domain,
	brandId,
	brandName,
	competitors,
	onAdded,
}: {
	domain: string;
	brandId: string;
	brandName?: string;
	competitors: Array<{ id: string; name: string; domains: string[] }>;
	onAdded?: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [newName, setNewName] = useState("");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");

	const handleSuccess = () => {
		setSaving(false);
		setSaved(true);
		setError("");
		setOpen(false);
		onAdded?.();
	};

	const handleError = (e: unknown) => {
		setSaving(false);
		setError("Something went wrong. Please try again.");
		Sentry.captureException(e);
	};

	const handleAddToBrand = async () => {
		setSaving(true);
		setError("");
		try {
			await addDomainToBrandFn({ data: { brandId, domain } });
			handleSuccess();
		} catch (e) {
			handleError(e);
		}
	};

	const handleAddToExisting = async (competitorId: string) => {
		setSaving(true);
		setError("");
		try {
			await addDomainToCompetitorFn({ data: { brandId, competitorId, domain } });
			handleSuccess();
		} catch (e) {
			handleError(e);
		}
	};

	const handleCreateNew = async () => {
		if (!newName.trim()) return;
		setSaving(true);
		setError("");
		try {
			await createCompetitorFromDomainFn({ data: { brandId, name: newName.trim(), domain } });
			setNewName("");
			handleSuccess();
		} catch (e) {
			handleError(e);
		}
	};

	if (saved) {
		return (
			<span className="shrink-0 p-1 text-muted-foreground">
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			</span>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="shrink-0 p-1 rounded hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
					title={`Track ${domain}`}
				>
					<IconPlus className="h-3.5 w-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-72 p-3" align="end">
				<div className="space-y-3">
					<p className="text-xs font-medium">Track <strong>{domain}</strong></p>

					{error && (
						<p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">{error}</p>
					)}

					<div className="space-y-1">
						<div className="flex items-center gap-1">
							<p className="text-[11px] text-muted-foreground">Add as brand domain</p>
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3 w-3 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-xs font-normal">
									Applies <strong>retroactively</strong> &mdash; all existing and future citations from this domain will be classified as your brand.
								</TooltipContent>
							</Tooltip>
						</div>
						<button
							type="button"
							onClick={handleAddToBrand}
							disabled={saving}
							className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted cursor-pointer disabled:opacity-50 transition-colors"
						>
							{brandName || "My brand"}
						</button>
					</div>

					{competitors.length > 0 && (
						<div className="space-y-1">
							<div className="flex items-center gap-1">
								<p className="text-[11px] text-muted-foreground">Add to existing competitor</p>
								<Tooltip>
									<TooltipTrigger asChild>
										<IconInfoCircle className="h-3 w-3 text-muted-foreground cursor-help" />
									</TooltipTrigger>
									<TooltipContent className="max-w-xs text-xs font-normal">
										Applies <strong>retroactively</strong> &mdash; all existing and future citations from this domain will be classified under the selected competitor.
									</TooltipContent>
								</Tooltip>
							</div>
							<div className="max-h-32 overflow-y-auto space-y-0.5">
								{competitors.map((c) => (
									<button
										key={c.id}
										type="button"
										onClick={() => handleAddToExisting(c.id)}
										disabled={saving}
										className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted cursor-pointer disabled:opacity-50 transition-colors"
									>
										{c.name}
									</button>
								))}
							</div>
						</div>
					)}

					<div className="space-y-1.5">
						<p className="text-[11px] text-muted-foreground">Or create new competitor:</p>
						<div className="flex gap-1.5">
							<Input
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="Competitor name"
								className="h-7 text-xs"
								onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateNew(); } }}
								disabled={saving}
							/>
							<Button
								size="sm"
								onClick={handleCreateNew}
								disabled={saving || !newName.trim()}
								className="h-7 px-2 text-xs cursor-pointer shrink-0"
							>
								Add
							</Button>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
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
				<UnderlineTabs
					tabs={OPPORTUNITY_TABS}
					activeKey="content_gaps"
					onSelect={() => {}}
				/>
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
									{prompt.uniqueCompetitors} {prompt.uniqueCompetitors === 1 ? "competitor" : "competitors"} cited {prompt.competitorCitationCount} {prompt.competitorCitationCount === 1 ? "time" : "times"} &mdash; your brand cited 0 times
								</p>
							</div>
						</Link>
					))}
				</div>
				{remaining > 0 && !expanded && (
					<button
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

function BreakdownDonut({
	title,
	items,
}: {
	title: string;
	items: { label: string; count: number; color: string }[];
}) {
	const total = items.reduce((s, i) => s + i.count, 0);
	const slices = items.filter((i) => i.count > 0);
	return (
		<div className="flex-1 min-w-0">
			<div className="text-sm font-medium mb-3">{title}</div>
			<div className="flex items-center gap-4">
				<ChartContainer config={{}} className="h-[128px] w-[128px] shrink-0">
					<PieChart>
						<Pie data={slices} dataKey="count" nameKey="label" innerRadius={36} outerRadius={60} paddingAngle={1} strokeWidth={0}>
							{slices.map((it) => (
								<Cell key={it.label} fill={it.color} />
							))}
						</Pie>
					</PieChart>
				</ChartContainer>
				<div className="min-w-0 flex-1 space-y-1">
					{slices.slice(0, 7).map((it) => (
						<div key={it.label} className="flex items-center gap-2 text-xs">
							<span className="h-2.5 w-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: it.color }} />
							<span className="text-muted-foreground truncate">{it.label}</span>
							<span className="ml-auto font-mono tabular-nums">{total > 0 ? Math.round((it.count / total) * 100) : 0}%</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function CitationsDisplay({
	citationData,
	brandId,
	brandName,
	showStats = false,
	maxDomains = 20,
	maxUrls = 20,
	days = 7,
	onCompetitorAdded,
}: CitationsDisplayProps) {
	const [domainSearch, setDomainSearch] = useState("");
	const [urlSearch, setUrlSearch] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [selectedPageType, setSelectedPageType] = useState<string>("all");
	const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeType>("new_pages");
	const [changeTabExpanded, setChangeTabExpanded] = useState(false);
	const [visibleDomains, setVisibleDomains] = useState(maxDomains);
	const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
	const [showAllProducts, setShowAllProducts] = useState(false);
	const [productFilter, setProductFilter] = useState<"all" | "brand" | "competitor">("all");
	const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
	const [showAllQueries, setShowAllQueries] = useState(false);

	if (citationData.totalCitations === 0) {
		return null;
	}

	const brandShare = citationData.totalCitations > 0
		? Math.round((citationData.categoryCounts.brand / citationData.totalCitations) * 100)
		: 0;

	const filteredDomains = useMemo(() => {
		if (!domainSearch) return citationData.domainDistribution;
		const q = domainSearch.toLowerCase();
		return citationData.domainDistribution.filter((d) => d.domain.toLowerCase().includes(q));
	}, [citationData.domainDistribution, domainSearch]);

	const filteredUrls = useMemo(() => {
		let urls = citationData.specificUrls;
		if (selectedCategory !== "all") {
			urls = urls.filter((u) => u.category === selectedCategory);
		}
		if (selectedPageType !== "all") {
			urls = urls.filter((u) => u.pageType === selectedPageType);
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
	}, [citationData.specificUrls, selectedCategory, selectedPageType, urlSearch, maxUrls]);

	const domainTypeItems = useMemo(() => {
		const cc = citationData.categoryCounts;
		const items = [{ label: CATEGORY_CONFIG.brand.label, count: cc.brand ?? 0, category: "brand", tooltip: CATEGORY_TOOLTIPS.brand }];
		for (const c of CITATION_CATEGORIES) {
			if (c === "brand" || c === "other" || (cc[c] ?? 0) <= 0) continue;
			items.push({ label: CATEGORY_CONFIG[c].label, count: cc[c], category: c, tooltip: CATEGORY_TOOLTIPS[c] });
		}
		const fixed = items.slice(0, 1);
		const middle = items.slice(1).sort((a, b) => b.count - a.count);
		const result = [...fixed, ...middle];
		if ((cc.other ?? 0) > 0) result.push({ label: CATEGORY_CONFIG.other.label, count: cc.other, category: "other", tooltip: CATEGORY_TOOLTIPS.other });
		return result;
	}, [citationData.categoryCounts]);

	const trendData = useMemo(() => {
		const ts = citationData.citationTimeSeries ?? [];
		return ts.map((p) => {
			const point: Record<string, number | string> = { date: p.date };
			let otherSources = 0;
			for (const c of CITATION_CATEGORIES) {
				const v = (p as Partial<Record<CitationCategory, number>>)[c] ?? 0;
				if (TREND_PRIMARY.includes(c)) point[c] = v;
				else otherSources += v;
			}
			point.otherSources = otherSources;
			return point;
		});
	}, [citationData.citationTimeSeries]);

	const pageTypes = useMemo(
		() => [...(citationData.pageTypeDistribution ?? [])].sort((a, b) => b.count - a.count),
		[citationData.pageTypeDistribution],
	);
	const pageTypeTabs = useMemo<{ key: string; label: string }[]>(
		() => [{ key: "all", label: "All types" }, ...pageTypes.map((d) => ({ key: d.pageType as string, label: PAGE_TYPE_CONFIG[d.pageType].label }))],
		[pageTypes],
	);
	const googleModule = citationData.googleModule;
	const googleProducts = useMemo(() => {
		const ps = citationData.googleModule?.shopping.products ?? [];
		return productFilter === "all" ? ps : ps.filter((p) => p.attribution === productFilter);
	}, [citationData.googleModule, productFilter]);

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
								Citation Breakdown
								<Tooltip>
									<TooltipTrigger asChild>
										<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
									</TooltipTrigger>
									<TooltipContent className="max-w-xs text-sm font-normal">
										<p className="mb-2"><strong>Source</strong> is who published the page; <strong>page type</strong> is what kind of page it is.</p>
										<p><strong>Competitor</strong> domains are only those in your {brandId ? <Link to="/app/$brand/settings/competitors" params={{ brand: brandId }} className="underline">competitors list</Link> : "competitors list"}.</p>
									</TooltipContent>
								</Tooltip>
							</CardTitle>
						</CardHeader>
						<Separator />
						<CardContent className="flex-1 flex flex-col sm:flex-row gap-6 pt-4">
							<BreakdownDonut
								title="By source"
								items={domainTypeItems.map((i) => ({ label: i.label, count: i.count, color: DOMAIN_CATEGORY_COLORS[i.category] ?? "#9ca3af" }))}
							/>
							<BreakdownDonut
								title="By page type"
								items={pageTypes.map((d) => ({ label: PAGE_TYPE_CONFIG[d.pageType].label, count: d.count, color: PAGE_TYPE_COLORS[d.pageType] ?? "#9ca3af" }))}
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
							<AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
										const dp = payload[0]?.payload as Record<string, number | string> | undefined;
										const [year, month, day] = (label as string).split("-").map(Number);
										const date = new Date(year, month - 1, day);
										const formattedDate = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
										return (
											<div className="border-border/50 bg-background grid min-w-[10rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
												<div className="font-medium">{formattedDate}</div>
											<div className="grid gap-1">
												{TREND_BANDS.map((band) => {
													const value = dp?.[band.key] as number | undefined;
													if (!value) return null;
													return (
														<div key={band.key} className="flex items-center gap-2">
															<div className={`shrink-0 rounded-[2px] h-2.5 w-2.5 ${band.dotClass}`} />
															<span className="text-muted-foreground">{band.label}</span>
															<span className="ml-auto font-mono tabular-nums">{value}%</span>
														</div>
													);
												})}
											</div>
											</div>
										);
									}}
								/>
							<Area dataKey="otherSources" type="monotone" stackId="1" stroke="var(--color-otherSources)" fill="var(--color-otherSources)" fillOpacity={0.8} strokeWidth={0} />
							<Area dataKey="social" type="monotone" stackId="1" stroke="var(--color-social)" fill="var(--color-social)" fillOpacity={0.8} strokeWidth={0} />
							<Area dataKey="reviews" type="monotone" stackId="1" stroke="var(--color-reviews)" fill="var(--color-reviews)" fillOpacity={0.8} strokeWidth={0} />
							<Area dataKey="editorial" type="monotone" stackId="1" stroke="var(--color-editorial)" fill="var(--color-editorial)" fillOpacity={0.8} strokeWidth={0} />
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
								onChange={(e) => { setDomainSearch(e.target.value); setVisibleDomains(maxDomains); }}
								className="h-8 pl-8 text-xs"
								/>
							</div>
						</div>
					</CardHeader>
					<Separator />
					<CardContent>
						<ProgressBarChart
							items={filteredDomains.slice(0, visibleDomains).map((domain) => ({
								label: domain.domain,
								count: domain.count,
								category: domain.category || "other",
							action: domain.category === "other" && brandId && citationData.competitors ? (
								<TrackDomainPopover
									domain={domain.domain}
									brandId={brandId}
									brandName={brandName}
									competitors={citationData.competitors}
									onAdded={onCompetitorAdded}
								/>
								) : undefined,
							}))}
							colorMapping={DOMAIN_CATEGORY_COLORS}
							percentageMode="max"
						/>
						{filteredDomains.length > visibleDomains && visibleDomains < 100 && (
							<button
								onClick={() => setVisibleDomains((prev) => Math.min(prev + 20, 100))}
								className="mt-6 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-3 py-1.5 rounded-md border border-border hover:bg-muted/60 transition-colors"
							>
								Show more
							</button>
						)}
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
									Individual pages cited by LLMs{citationData.categoryCounts.brand > 0 && brandName && (
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
						{pageTypeTabs.length > 2 && (
							<div className="mt-2">
								<UnderlineTabs
									tabs={pageTypeTabs}
									activeKey={selectedPageType}
									onSelect={setSelectedPageType}
								/>
							</div>
						)}
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

			{/* Google Shopping */}
			{googleModule && googleModule.shopping.products.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-1.5">
							Google Shopping
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-sm font-normal">
									Product cards Google AI Mode showed when answering your prompts. The number next to each is how many times that card appeared across results (card inclusions, not unique products). Kept separate from the citation mix above.
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>
							Products Google AI Mode surfaced — <span className="font-medium text-emerald-600">{googleModule.shopping.brandCount.toLocaleString()}</span> appearances for yours vs <span className="font-medium text-red-600">{googleModule.shopping.competitorCount.toLocaleString()}</span> for competitors
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent className="space-y-6">
						{googleModule.shopping.products.length > 0 && (
							<div>
								<div className="flex items-center justify-between mb-2 gap-2">
									<h4 className="text-sm font-medium shrink-0">Products surfaced</h4>
									<div className="flex items-center gap-1">
										{([["all", "All"], ["brand", "Yours"], ["competitor", "Competitors"]] as const).map(([key, label]) => (
											<button
												key={key}
												type="button"
												onClick={() => { setProductFilter(key); setShowAllProducts(false); }}
												className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${productFilter === key ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
											>
												{label}
											</button>
										))}
									</div>
								</div>
								<div className="divide-y divide-border/50">
									{(showAllProducts ? googleProducts : googleProducts.slice(0, 5)).map((product) => {
										const isExpanded = expandedProduct === product.name;
										return (
											<div key={product.name}>
												<div className="flex items-center justify-between py-2 gap-3">
													<button
														type="button"
														onClick={() => setExpandedProduct(isExpanded ? null : product.name)}
														className="flex items-center gap-1.5 min-w-0 cursor-pointer group text-left"
													>
														<IconChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
														<span className={`shrink-0 rounded-full h-2 w-2 ${attributionDotClass(product.attribution)}`} />
														<span className="text-sm font-medium text-foreground group-hover:underline truncate">{product.name}</span>
														{product.attribution === "competitor" && product.competitorName && (
															<span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">({product.competitorName})</span>
														)}
													</button>
													<span className="text-sm font-semibold tabular-nums shrink-0">{product.count.toLocaleString()}</span>
												</div>
												{isExpanded && product.prompts.length > 0 && (
													<div className="pl-5 pb-2 space-y-0.5">
														{product.prompts.map((p) => (
															brandId ? (
																<Link key={p.id} to="/app/$brand/prompts/$promptId" params={{ brand: brandId, promptId: p.id }} className="flex items-center justify-between py-1 group text-xs">
																	<span className="text-muted-foreground group-hover:text-foreground group-hover:underline truncate min-w-0">{p.value}</span>
																	<span className="tabular-nums text-muted-foreground shrink-0 ml-3">{p.count.toLocaleString()}</span>
																</Link>
															) : (
																<div key={p.id} className="flex items-center justify-between py-1 text-xs">
																	<span className="text-muted-foreground truncate min-w-0">{p.value}</span>
																	<span className="tabular-nums text-muted-foreground shrink-0 ml-3">{p.count.toLocaleString()}</span>
																</div>
															)
														))}
													</div>
												)}
											</div>
										);
									})}
								</div>
								{googleProducts.length > 5 && !showAllProducts && (
									<button
										onClick={() => setShowAllProducts(true)}
										className="mt-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-3 py-1.5 rounded-md border border-border hover:bg-muted/60 transition-colors"
									>
										Show {googleProducts.length - 5} more
									</button>
								)}
							</div>
						)}

						{googleModule.search.queries.length > 0 && (
							<div>
								<h4 className="text-sm font-medium mb-2">Search queries</h4>
								<div className="divide-y divide-border/50">
									{(showAllQueries ? googleModule.search.queries : googleModule.search.queries.slice(0, 5)).map((q) => {
										const isExpanded = expandedQuery === q.query;
										return (
											<div key={q.query}>
												<div className="flex items-center justify-between py-2 gap-3">
													<button
														type="button"
														onClick={() => setExpandedQuery(isExpanded ? null : q.query)}
														className="flex items-center gap-1.5 min-w-0 cursor-pointer group text-left"
													>
														<IconChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
														<IconSearch className="h-3 w-3 shrink-0 text-muted-foreground" />
														<span className="text-sm font-medium text-foreground group-hover:underline truncate">{q.query}</span>
													</button>
													<span className="text-sm font-semibold tabular-nums shrink-0">{q.count.toLocaleString()}</span>
												</div>
												{isExpanded && q.prompts.length > 0 && (
													<div className="pl-5 pb-2 space-y-0.5">
														{q.prompts.map((p) => (
															brandId ? (
																<Link key={p.id} to="/app/$brand/prompts/$promptId" params={{ brand: brandId, promptId: p.id }} className="flex items-center justify-between py-1 group text-xs">
																	<span className="text-muted-foreground group-hover:text-foreground group-hover:underline truncate min-w-0">{p.value}</span>
																	<span className="tabular-nums text-muted-foreground shrink-0 ml-3">{p.count.toLocaleString()}</span>
																</Link>
															) : (
																<div key={p.id} className="flex items-center justify-between py-1 text-xs">
																	<span className="text-muted-foreground truncate min-w-0">{p.value}</span>
																	<span className="tabular-nums text-muted-foreground shrink-0 ml-3">{p.count.toLocaleString()}</span>
																</div>
															)
														))}
													</div>
												)}
											</div>
										);
									})}
								</div>
								{googleModule.search.queries.length > 5 && !showAllQueries && (
									<button
										onClick={() => setShowAllQueries(true)}
										className="mt-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-3 py-1.5 rounded-md border border-border hover:bg-muted/60 transition-colors"
									>
										Show {googleModule.search.queries.length - 5} more
									</button>
								)}
							</div>
						)}
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
