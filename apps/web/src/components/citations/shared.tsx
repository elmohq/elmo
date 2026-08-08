import {
	CATEGORY_CONFIG,
	CITATION_CATEGORIES,
	CITATION_PAGE_TYPES,
	type CitationCategory,
	PAGE_TYPE_CONFIG,
} from "@/lib/domain-categories";
import * as m from "@/paraglide/messages.js";

export const getCategoryLabel = (category: string) => {
	switch (category as CitationCategory) {
		case "brand": return m.citation_category_brand();
		case "competitor": return m.citation_category_competitor();
		case "editorial": return m.citation_category_editorial();
		case "reviews": return m.citation_category_reviews();
		case "ecommerce": return m.citation_category_ecommerce();
		case "social": return m.citation_category_social();
		case "developer": return m.citation_category_developer();
		case "pr": return m.citation_category_pr();
		case "reference": return m.citation_category_reference();
		case "institutional": return m.citation_category_institutional();
		case "other": return m.citation_category_other();
		default: return category;
	}
};

export const getPageTypeLabel = (pageType: string) => {
	switch (pageType) {
		case "homepage": return m.citation_type_homepage();
		case "article": return m.citation_type_article();
		case "listicle": return m.citation_type_listicle();
		case "howto": return m.citation_type_howto();
		case "comparison": return m.citation_type_comparison();
		case "review": return m.citation_type_review();
		case "forum": return m.citation_type_forum();
		case "video": return m.citation_type_video();
		case "doc": return m.citation_type_doc();
		case "product": return m.citation_type_product();
		case "info": return m.citation_type_info();
		case "search": return m.citation_type_search();
		case "shopping": return m.citation_type_shopping();
		case "other": return m.citation_type_other();
		default: return pageType;
	}
};

export const getCategoryColorClass = (category: string) =>
	CATEGORY_CONFIG[category as CitationCategory]?.badgeClass ?? "bg-gray-500/90 text-white";

export const formatUrlForDisplay = (url: string) => {
	let displayUrl = url.replace(/^https?:\/\//, "");
	displayUrl = displayUrl.replace(/^www\./, "");
	displayUrl = displayUrl.replace(/#:~:text=[^&]*/, "");
	if (displayUrl.endsWith("#")) displayUrl = displayUrl.slice(0, -1);
	const maxLength = 80;
	if (displayUrl.length > maxLength) {
		displayUrl = `${displayUrl.substring(0, maxLength)}...`;
	}
	return displayUrl;
};

export function formatPeriodLabel(days: number): string {
	if (days === 1) return m.period_24_hours();
	if (days === 7) return m.period_week();
	if (days === 14) return m.period_2_weeks();
	if (days === 30) return m.period_month();
	if (days === 60) return m.period_2_months();
	if (days === 90) return m.period_3_months();
	return m.period_days({ count: days });
}

export const extractSubreddit = (url: string): string | null => {
	try {
		const match = url.match(/reddit\.com\/r\/([^/?#]+)/i);
		return match ? `r/${match[1]}` : null;
	} catch {
		return null;
	}
};

export const extractFilenameFromUrl = (url: string) => {
	try {
		const urlObj = new URL(url);
		const segments = urlObj.pathname.split("/").filter(Boolean);
		if (segments.length === 0) return urlObj.hostname.replace(/^www\./, "");
		return segments[segments.length - 1];
	} catch {
		return url;
	}
};

export const getCategoryMeta = (): Record<string, { label: string; color: string }> => Object.fromEntries(
	CITATION_CATEGORIES.map((c) => [c, { label: getCategoryLabel(c), color: CATEGORY_CONFIG[c].chartColor }]),
);
export const getPageTypeMeta = (): Record<string, { label: string; color: string }> => Object.fromEntries(
	CITATION_PAGE_TYPES.map((p) => [p, { label: getPageTypeLabel(p), color: PAGE_TYPE_CONFIG[p].chartColor }]),
);

export const attributionDotClass = (a: "brand" | "competitor" | "other") =>
	a === "brand" ? "bg-emerald-500" : a === "competitor" ? "bg-red-500" : "bg-gray-400";

export function UnderlineTabs<T extends string>({
	tabs,
	activeKey,
	onSelect,
}: {
	tabs: readonly { key: T; label: string }[];
	activeKey: T;
	onSelect: (key: T) => void;
}) {
	return (
		<nav className="-mb-px flex gap-4 overflow-x-auto border-b border-border" aria-label={m.common_tabs()}>
			{tabs.map(({ key, label }) => (
				<button
					key={key}
					type="button"
					onClick={() => onSelect(key)}
					className={`shrink-0 cursor-pointer whitespace-nowrap pb-2.5 text-xs font-medium transition-colors border-b-2 ${
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
