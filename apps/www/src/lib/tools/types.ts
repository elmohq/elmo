/**
 * The shapes the free tools return to the browser. Kept apart from the handlers
 * so route components can import the types without pulling server-only modules
 * (node:dns, the fetcher) into the client bundle.
 */

export interface CrawlerVerdict {
	/** robots.txt product token, e.g. `GPTBot`. */
	token: string;
	allowed: boolean;
	/** The user-agent group that governs this bot, `*`, or null when none does. */
	matchedAgent: string | null;
	/** The winning rule as written, e.g. `Disallow: /`. */
	matchedRule: string | null;
	/** Every disallow pattern in the governing group. */
	disallowedPatterns: string[];
	crawlDelay?: number;
}

export type RobotsOutcome = "found" | "missing" | "server-error";

export interface CrawlerCheckResult {
	siteUrl: string;
	/** The robots.txt URL that answered, after redirects. */
	robotsUrl: string;
	/** The path the verdicts were evaluated against. */
	path: string;
	outcome: RobotsOutcome;
	httpStatus: number;
	robotsTxt: string;
	robotsTxtTruncated: boolean;
	sitemaps: string[];
	crawlers: CrawlerVerdict[];
}

export interface SiteDiscovery {
	origin: string;
	siteName: string;
	siteDescription: string | null;
	/** The sitemap the URLs came from. */
	sitemapUrl: string;
	urls: string[];
	/** True when the site has more pages than the tool will read. */
	truncated: boolean;
}

export interface PageSummary {
	url: string;
	title: string | null;
	description: string | null;
}
