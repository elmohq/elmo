import { fetchRemoteText } from "./fetch-remote";
import { extractPageMeta } from "./html-meta";
import { MAX_PAGES, MAX_SITEMAPS, SUMMARY_BATCH_SIZE } from "./limits";
import { parseRobotsTxt } from "./robots";
import { normalizeSiteUrl, ToolError } from "./site-url";
import { canonicalizeUrl, collectSitemapUrls, isContentUrl } from "./sitemap";
import type { PageSummary, SiteDiscovery } from "./types";

const SITEMAP_GUESSES = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/wp-sitemap.xml"];
/** Total wall-clock budget for one discovery, comfortably inside any function limit. */
const DISCOVERY_BUDGET_MS = 25_000;

async function sitemapCandidates(origin: string): Promise<URL[]> {
	const candidates: URL[] = [];

	try {
		const robots = await fetchRemoteText(new URL("/robots.txt", origin), {
			accept: "text/plain,*/*;q=0.8",
			timeoutMs: 5_000,
		});
		if (robots.ok) {
			for (const declared of parseRobotsTxt(robots.body).sitemaps) {
				try {
					const url = new URL(declared);
					if (url.origin === origin) candidates.push(url);
				} catch {
					// Ignore a malformed Sitemap: line and fall through to the guesses.
				}
			}
		}
	} catch {
		// robots.txt is only a hint here — the conventional paths still apply.
	}

	for (const guess of SITEMAP_GUESSES) candidates.push(new URL(guess, origin));
	return candidates;
}

export async function discoverSite(input: string): Promise<SiteDiscovery> {
	const deadline = Date.now() + DISCOVERY_BUDGET_MS;
	const target = normalizeSiteUrl(input);
	// A pasted sitemap URL is used as-is; otherwise we go looking for one.
	const pastedSitemap = /\.xml$/i.test(target.pathname) ? target : null;

	let origin = target.origin;
	let siteName = target.hostname.replace(/^www\./, "");
	let siteDescription: string | null = null;
	try {
		const home = await fetchRemoteText(new URL("/", origin), {
			accept: "text/html,*/*;q=0.8",
			maxBytes: 256 * 1024,
			timeoutMs: 6_000,
		});
		if (home.ok) {
			// Adopt the origin the homepage redirected to. Apex-to-www is the
			// common case, and a sitemap declared on www is not same-origin with
			// the apex the visitor typed.
			origin = new URL(home.url).origin;
			const meta = extractPageMeta(home.body);
			if (meta.title) siteName = meta.title;
			siteDescription = meta.description;
		}
	} catch {
		// A homepage we cannot read costs us the title, not the run.
	}

	const candidates = pastedSitemap ? [pastedSitemap] : await sitemapCandidates(origin);

	for (const candidate of candidates) {
		const { urls, truncated } = await collectSitemapUrls(candidate, origin, {
			maxUrls: MAX_PAGES,
			maxSitemaps: MAX_SITEMAPS,
			deadline,
		});
		if (urls.length === 0) continue;

		const home = canonicalizeUrl(origin);
		const ordered = urls.includes(home) ? urls : [home, ...urls].slice(0, MAX_PAGES);

		return {
			origin,
			siteName,
			siteDescription,
			sitemapUrl: candidate.toString(),
			urls: ordered,
			truncated,
		};
	}

	throw new ToolError(
		`No sitemap found for ${origin}. Add one at /sitemap.xml, or paste the full sitemap URL to generate from it directly.`,
	);
}

export async function describePages(urls: string[]): Promise<PageSummary[]> {
	const batch = urls.slice(0, SUMMARY_BATCH_SIZE);

	return Promise.all(
		batch.map(async (raw): Promise<PageSummary> => {
			try {
				const url = normalizeSiteUrl(raw);
				if (!isContentUrl(url.toString(), url.origin)) return { url: raw, title: null, description: null };

				const response = await fetchRemoteText(url, {
					accept: "text/html,*/*;q=0.8",
					maxBytes: 256 * 1024,
					timeoutMs: 6_000,
				});
				if (!response.ok) return { url: raw, title: null, description: null };

				const meta = extractPageMeta(response.body);
				return { url: raw, title: meta.title, description: meta.description };
			} catch {
				// One unreachable page falls back to a slug-derived title.
				return { url: raw, title: null, description: null };
			}
		}),
	);
}
