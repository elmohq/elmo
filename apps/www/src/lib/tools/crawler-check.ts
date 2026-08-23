import { AI_CRAWLERS } from "./ai-crawlers";
import { fetchRemoteText } from "./fetch-remote";
import { evaluate, parseRobotsTxt } from "./robots";
import { normalizeSiteUrl } from "./site-url";
import type { CrawlerCheckResult, CrawlerVerdict, RobotsOutcome } from "./types";

/** Enough robots.txt to show in full on the page; the rest is elided. */
const MAX_DISPLAY_BYTES = 20_000;

/**
 * Plenty of sites answer /robots.txt with their HTML 404 page and a 200 status.
 * Parsing that produces a confident "everything is allowed" from a file that
 * does not exist, so treat it as missing instead.
 */
function looksLikeHtml(body: string, contentType: string | null): boolean {
	if (contentType?.toLowerCase().includes("text/html")) return true;
	return /^\s*(?:<!doctype html|<html\b)/i.test(body);
}

export async function checkAiCrawlers(input: string): Promise<CrawlerCheckResult> {
	const target = normalizeSiteUrl(input);
	const path = target.pathname || "/";
	const robotsUrl = new URL("/robots.txt", target.origin);

	const response = await fetchRemoteText(robotsUrl, {
		accept: "text/plain,*/*;q=0.8",
		maxBytes: 512 * 1024,
	});

	let outcome: RobotsOutcome;
	if (response.status >= 500) outcome = "server-error";
	else if (!response.ok || looksLikeHtml(response.body, response.contentType)) outcome = "missing";
	else outcome = "found";

	const robots = outcome === "found" ? parseRobotsTxt(response.body) : { groups: [], sitemaps: [] };

	const crawlers: CrawlerVerdict[] = AI_CRAWLERS.map((crawler) => {
		const verdict = evaluate(robots, crawler.token, path);
		return {
			token: crawler.token,
			// A robots.txt that keeps returning a server error is treated as a
			// site-wide disallow by Google and others, so report it as blocked.
			allowed: outcome === "server-error" ? false : verdict.allowed,
			matchedAgent: verdict.matchedAgent,
			matchedRule: verdict.matchedRule
				? `${verdict.matchedRule.type === "allow" ? "Allow" : "Disallow"}: ${verdict.matchedRule.pattern}`
				: null,
			disallowedPatterns: verdict.disallowedPatterns,
			crawlDelay: verdict.crawlDelay,
		};
	});

	const body = outcome === "found" ? response.body : "";

	return {
		// The origin that actually answered, so an apex-to-www redirect is
		// reported against the host whose rules were read.
		siteUrl: new URL(response.url).origin,
		robotsUrl: response.url,
		path,
		outcome,
		httpStatus: response.status,
		robotsTxt: body.slice(0, MAX_DISPLAY_BYTES),
		robotsTxtTruncated: response.truncated || body.length > MAX_DISPLAY_BYTES,
		sitemaps: robots.sitemaps,
		crawlers,
	};
}
