import { type Bot, PROBE_BOTS } from "./bots";
import type { Fetched, FetchedResponse, Fetcher } from "./fetcher";
import { type ParsedPage, parsePage } from "./parse/html";
import { looksLikeHtml, markdownLinks } from "./parse/markdown";
import { type ParsedRobots, parseRobots } from "./parse/robots";
import { parseSitemap, type SitemapEntry } from "./parse/sitemap";
import { samplePages } from "./sample";

const MARKDOWN_ACCEPT = "text/markdown, text/plain;q=0.9, */*;q=0.1";
const TEXT_ACCEPT = "text/plain, text/markdown;q=0.9, */*;q=0.1";
const SMALL_BODY = 256 * 1024;
const SITEMAP_BODY = 5 * 1024 * 1024;
const LLMS_LINK_PROBES = 3;

export interface PageArtifacts {
	url: string;
	html: Fetched;
	parsed?: ParsedPage;
	markdownAccept?: Fetched;
	markdownSuffix?: Fetched;
}

export interface LinkedPage {
	href?: string;
	fetched?: Fetched;
}

export interface SiteArtifacts {
	origin: string;
	robotsFetch: Fetched;
	robots?: ParsedRobots;
	pages: PageArtifacts[];
	sitemap: { url?: string; fetches: Fetched[]; entries: SitemapEntry[]; valid: boolean };
	llmsTxt?: Fetched;
	llmsFullTxt?: Fetched;
	llmsLinkProbes: Fetched[];
	llmsSection?: Fetched;
	notFound?: Fetched;
	agentView?: Fetched;
	botProbes: { bot: Bot; fetched: Fetched }[];
	trust: Record<"about" | "contact" | "privacy", LinkedPage>;
	pricing: LinkedPage & { markdown?: Fetched };
}

export function isResponse(fetched: Fetched | undefined): fetched is FetchedResponse {
	return fetched?.kind === "response";
}

export function isOk(fetched: Fetched | undefined): fetched is FetchedResponse {
	return isResponse(fetched) && fetched.status >= 200 && fetched.status < 300;
}

export function contentType(fetched: Fetched | undefined): string {
	return isResponse(fetched) ? (fetched.headers["content-type"] ?? "").toLowerCase() : "";
}

export function isHtmlResponse(fetched: Fetched | undefined): boolean {
	return isResponse(fetched) && (contentType(fetched).includes("html") || looksLikeHtml(fetched.body));
}

function pagePath(url: string): string {
	return new URL(url).pathname.replace(/\/+$/, "");
}

function markdownSuffixUrl(url: string): string {
	const parsed = new URL(url);
	const path = pagePath(url);
	parsed.pathname = path === "" ? "/index.md" : `${path}.md`;
	parsed.search = "";
	return parsed.toString();
}

const TRUST_PATTERNS = {
	about: /\/(about|company|our-story|team)(\/|$)|^about( us)?$/i,
	contact: /\/(contact|contact-us|support)(\/|$)|^contact( us)?$/i,
	privacy: /\/(privacy|privacy-policy)(\/|$)|privacy/i,
};

function findLink(page: ParsedPage | undefined, origin: string, pattern: RegExp): string | undefined {
	return page?.links.find((link) => {
		const url = new URL(link.href);
		const sameSite = url.hostname.replace(/^www\./, "") === new URL(origin).hostname.replace(/^www\./, "");
		return sameSite && (pattern.test(url.pathname) || pattern.test(link.text));
	})?.href;
}

async function fetchSitemap(fetcher: Fetcher, robots: ParsedRobots | undefined, origin: string) {
	const declared = robots?.sitemaps.filter((url) => url.startsWith("http")) ?? [];
	const url = declared[0] ?? `${origin}/sitemap.xml`;
	const fetches: Fetched[] = [];
	const first = await fetcher.get(url, {
		accept: "application/xml, text/xml;q=0.9, */*;q=0.1",
		maxBytes: SITEMAP_BODY,
	});
	fetches.push(first);
	if (!isOk(first)) return { url, fetches, entries: [], valid: false };
	const parsed = parseSitemap(first.body);
	if (parsed.kind !== "index") return { url, fetches, entries: parsed.entries, valid: parsed.kind === "urlset" };

	// Only the freshest child sitemap: enough pages to sample without walking the whole index.
	const child = [...parsed.entries].sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""))[0];
	if (!child) return { url, fetches, entries: [], valid: true };
	const childFetch = await fetcher.get(child.loc, {
		accept: "application/xml, text/xml;q=0.9, */*;q=0.1",
		maxBytes: SITEMAP_BODY,
	});
	fetches.push(childFetch);
	const childParsed = isOk(childFetch) ? parseSitemap(childFetch.body) : undefined;
	return { url, fetches, entries: childParsed?.entries ?? [], valid: childParsed?.kind === "urlset" };
}

interface GatherOptions {
	fetcher: Fetcher;
	origin: string;
	homepage?: FetchedResponse;
	priorityPages: string[];
	pageLimit: number;
	userAgentToken: string;
}

function parseHtml(fetched: Fetched): ParsedPage | undefined {
	return isOk(fetched) && isHtmlResponse(fetched) ? parsePage(fetched.url, fetched.body) : undefined;
}

async function fetchRobots(fetcher: Fetcher, origin: string) {
	const robotsFetch = await fetcher.get(`${origin}/robots.txt`, {
		accept: TEXT_ACCEPT,
		ignoreRobots: true,
		maxBytes: SMALL_BODY,
	});
	const robots =
		isOk(robotsFetch) && !isHtmlResponse(robotsFetch) ? parseRobots(robotsFetch.url, robotsFetch.body) : undefined;
	if (robots) fetcher.setRobots(origin, robots);
	return { robotsFetch, robots };
}

async function fetchPages(
	options: GatherOptions,
	robots: ParsedRobots | undefined,
	candidates: string[],
	home: PageArtifacts,
) {
	const sampled = samplePages({
		origin: options.origin,
		priority: options.priorityPages,
		candidates,
		limit: options.pageLimit,
		isAllowed: (url) => robots?.isAllowed(url, options.userAgentToken) !== false,
	});
	const pages: PageArtifacts[] = [home];
	for (const url of sampled.slice(1)) {
		const html = await options.fetcher.get(url);
		pages.push({ url, html, parsed: parseHtml(html) });
	}
	return pages;
}

// The probes act as other bots, so robots.txt rules for ElmoBot can't gate them
// request by request; a site that keeps ElmoBot off its homepage gets none.
async function probeBots(
	options: GatherOptions,
	robots: ParsedRobots | undefined,
): Promise<SiteArtifacts["botProbes"]> {
	const home = `${options.origin}/`;
	if (robots?.isAllowed(home, options.userAgentToken) === false) return [];
	const probes: SiteArtifacts["botProbes"] = [];
	for (const bot of PROBE_BOTS) {
		probes.push({ bot, fetched: await options.fetcher.get(home, { userAgent: bot.userAgent, ignoreRobots: true }) });
	}
	return probes;
}

async function probeLlmsLinks(fetcher: Fetcher, llmsTxt: Fetched): Promise<Fetched[]> {
	if (!isOk(llmsTxt) || isHtmlResponse(llmsTxt)) return [];
	const links = markdownLinks(llmsTxt.body)
		.map((link) => new URL(link.url, llmsTxt.url).toString())
		.filter((url) => url.startsWith("http"));
	const probes: Fetched[] = [];
	for (const url of [...new Set(links)].slice(0, LLMS_LINK_PROBES)) {
		probes.push(await fetcher.get(url, { accept: MARKDOWN_ACCEPT, maxBytes: SMALL_BODY }));
	}
	return probes;
}

async function fetchLinkedPages(fetcher: Fetcher, origin: string, pages: PageArtifacts[]) {
	const homeParsed = pages[0]?.parsed;
	const fetchLinked = async (pattern: RegExp): Promise<LinkedPage> => {
		const href = findLink(homeParsed, origin, pattern);
		if (!href) return {};
		const sampled = pages.find((page) => page.url === href);
		return { href, fetched: sampled?.html ?? (await fetcher.get(href, { maxBytes: SMALL_BODY })) };
	};
	const trust = {
		about: await fetchLinked(TRUST_PATTERNS.about),
		contact: await fetchLinked(TRUST_PATTERNS.contact),
		privacy: await fetchLinked(TRUST_PATTERNS.privacy),
	};
	const pricingPage = await fetchLinked(/\/(pricing|plans)(\/|$)|^pricing$/i);
	const markdown =
		pricingPage.href && isOk(pricingPage.fetched)
			? await fetcher.get(markdownSuffixUrl(pricingPage.href), { accept: MARKDOWN_ACCEPT, maxBytes: SMALL_BODY })
			: undefined;
	return { trust, pricing: { ...pricingPage, markdown } };
}

function linksToDocs(origin: string, urls: string[]): boolean {
	return urls.some((url) => {
		try {
			const parsed = new URL(url);
			return parsed.origin === origin && /^\/docs(\/|$)/.test(parsed.pathname);
		} catch {
			return false;
		}
	});
}

/** Fetches, in priority order, everything the checks look at. What the budget can't cover stays undefined. */
export async function gatherSite(options: GatherOptions): Promise<SiteArtifacts> {
	const { fetcher, origin } = options;
	const homeUrl = `${origin}/`;
	const { robotsFetch, robots } = await fetchRobots(fetcher, origin);

	const reused =
		options.homepage && new URL(options.homepage.url).toString() === homeUrl ? options.homepage : undefined;
	const homeFetch = reused ?? (await fetcher.get(homeUrl));
	const home: PageArtifacts = { url: homeUrl, html: homeFetch, parsed: parseHtml(homeFetch) };
	const homeLinks = home.parsed?.links.map((link) => link.href) ?? [];

	const sitemap = await fetchSitemap(fetcher, robots, origin);
	const candidates = sitemap.entries.length > 0 ? sitemap.entries.map((entry) => entry.loc) : homeLinks;
	const pages = await fetchPages(options, robots, candidates, home);

	const llmsTxt = await fetcher.get(`${origin}/llms.txt`, { accept: TEXT_ACCEPT, maxBytes: SMALL_BODY });
	for (const page of pages) page.markdownAccept = await fetcher.get(page.url, { accept: MARKDOWN_ACCEPT });
	const botProbes = await probeBots(options, robots);
	for (const page of pages) {
		page.markdownSuffix = await fetcher.get(markdownSuffixUrl(page.url), { accept: MARKDOWN_ACCEPT });
	}

	const notFound = await fetcher.get(`${origin}/elmo-audit-${Date.now().toString(36)}-not-a-page`);
	const llmsFullTxt = await fetcher.get(`${origin}/llms-full.txt`, { method: "HEAD", accept: TEXT_ACCEPT });
	const llmsLinkProbes = await probeLlmsLinks(fetcher, llmsTxt);
	const { trust, pricing } = await fetchLinkedPages(fetcher, origin, pages);
	const agentView = await fetcher.get(`${origin}/?mode=agent`);
	const llmsSection = linksToDocs(origin, [...candidates, ...homeLinks])
		? await fetcher.get(`${origin}/docs/llms.txt`, { accept: TEXT_ACCEPT, maxBytes: SMALL_BODY })
		: undefined;

	return {
		origin,
		robotsFetch,
		robots,
		pages,
		sitemap,
		llmsTxt,
		llmsFullTxt,
		llmsLinkProbes,
		llmsSection,
		notFound,
		agentView,
		botProbes,
		trust,
		pricing,
	};
}
