import { createFileRoute } from "@tanstack/react-router";
import { aeoVerticals } from "@/data/aeo-verticals";
import { aiSearchEngines } from "@/data/ai-search-engines";
import { productFeatures } from "@/data/features";
import { glossaryTerms } from "@/data/glossary";
import upcomingData from "@/data/upcoming-features.json";
import { blogSource } from "@/lib/blog";
import {
	CATEGORY_SLUGS,
	comparePairSlug,
	comparePairs,
	compareSetSlug,
	compareSets,
	competitors,
	competitorsWithOwnPages,
	FEATURE_SLUGS,
	getComparisonSlug,
	graveyardTools,
	hasOwnPages,
	indexableCategories,
	indexableFeatureKeys,
	indexedCompetitors,
	lastChecked,
	openSourceTools,
	toolsInCategory,
	toolsWithFeature,
} from "@/lib/competitors";
import { getGitHubReleases } from "@/lib/github-releases";
import { listLegalPages } from "@/lib/legal";
import { newest, pageLastUpdated } from "@/lib/page-dates";
import { source } from "@/lib/source";

const SITE_URL = "https://www.elmohq.com";

interface SitemapEntry {
	path: string;
	changefreq: string;
	priority: number;
	/**
	 * W3C date (YYYY-MM-DD). Only set when we have a real per-page date. A faked
	 * uniform lastmod (e.g. "today" on every URL) is an unreliable signal that
	 * Google discards, so pages without a genuine date omit it entirely.
	 */
	lastmod?: string;
}

// A directory page's data is as fresh as the most recently re-verified tool it covers.
const directoryLastChecked = lastChecked(indexedCompetitors);

const staticPages: SitemapEntry[] = [
	{ path: "/", changefreq: "weekly", priority: 1.0, lastmod: "2026-11-03" },
	{ path: "/answer-engine-optimization", changefreq: "monthly", priority: 0.9, lastmod: "2026-10-16" },
	{ path: "/generative-engine-optimization", changefreq: "monthly", priority: 0.9, lastmod: "2026-10-16" },
	{ path: "/features", changefreq: "monthly", priority: 0.8 },
	{ path: "/pricing", changefreq: "monthly", priority: 0.8, lastmod: "2026-09-24" },
	{ path: "/off-site-aeo", changefreq: "monthly", priority: 0.8, lastmod: "2026-10-16" },
	{ path: "/changelog", changefreq: "weekly", priority: 0.7 },
	{ path: "/roadmap", changefreq: "weekly", priority: 0.7 },
	{ path: "/docs", changefreq: "weekly", priority: 0.9 },
	{ path: "/blog", changefreq: "weekly", priority: 0.7 },
	{ path: "/statistics", changefreq: "weekly", priority: 0.8, lastmod: "2026-10-16" },
	{ path: "/ai-visibility-tools", changefreq: "weekly", priority: 0.8, lastmod: directoryLastChecked },
	{ path: "/about", changefreq: "monthly", priority: 0.7, lastmod: "2026-11-04" },
	{ path: "/vision", changefreq: "monthly", priority: 0.6, lastmod: "2026-10-16" },
	{ path: "/brand", changefreq: "monthly", priority: 0.5, lastmod: "2026-10-16" },
	{ path: "/status", changefreq: "daily", priority: 0.5 },
	{ path: "/support", changefreq: "monthly", priority: 0.5, lastmod: "2026-10-16" },
	{ path: "/demo", changefreq: "monthly", priority: 0.5, lastmod: "2026-10-16" },
	{ path: "/legal", changefreq: "yearly", priority: 0.3 },
];

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async () => {
				const docsPages: SitemapEntry[] = source.getPages().map((page) => ({
					path: page.url,
					changefreq: "weekly",
					priority: 0.7,
					lastmod: pageLastUpdated(page),
				}));

				const legalPages: SitemapEntry[] = listLegalPages().map((page) => ({
					path: `/legal/${page.slug}`,
					changefreq: "yearly",
					priority: 0.3,
					lastmod: page.updated,
				}));

				const blogPages: SitemapEntry[] = blogSource.getPages().map((page) => ({
					path: page.url,
					changefreq: "monthly",
					priority: 0.7,
					// Real content date from frontmatter (schema normalizes to YYYY-MM-DD).
					lastmod: pageLastUpdated(page),
				}));

				const comparisonPages: SitemapEntry[] = competitors.filter(hasOwnPages).map((c) => ({
					path: `/ai-visibility-tools/${getComparisonSlug(c)}`,
					changefreq: "monthly",
					priority: 0.6,
					lastmod: c.checkedAt,
				}));

				// Programmatic directory sub-pages (hubs + generated pages).
				const directorySubPages: SitemapEntry[] = [
					...["compare", "alternatives", "features", "category"].map((hub) => ({
						path: `/ai-visibility-tools/${hub}`,
						changefreq: "monthly",
						priority: 0.5,
						lastmod: directoryLastChecked,
					})),
					{
						path: "/ai-visibility-tools/graveyard",
						changefreq: "monthly",
						priority: 0.5,
						lastmod: lastChecked(graveyardTools),
					},
					...comparePairs.map(([a, b]) => ({
						path: `/ai-visibility-tools/compare/${comparePairSlug(a, b)}`,
						changefreq: "monthly",
						priority: 0.6,
						lastmod: lastChecked([a, b]),
					})),
					...compareSets.map((tools) => ({
						path: `/ai-visibility-tools/compare/${compareSetSlug(tools)}`,
						changefreq: "monthly",
						priority: 0.6,
						lastmod: lastChecked(tools),
					})),
					...competitorsWithOwnPages.map((c) => ({
						path: `/ai-visibility-tools/alternatives/${c.slug}`,
						changefreq: "monthly",
						priority: 0.6,
						lastmod: c.checkedAt,
					})),
					...indexableFeatureKeys().map((key) => ({
						path: `/ai-visibility-tools/features/${FEATURE_SLUGS[key]}`,
						changefreq: "monthly",
						priority: 0.5,
						lastmod: lastChecked(toolsWithFeature(key)),
					})),
					...indexableCategories.map((cat) => ({
						path: `/ai-visibility-tools/category/${CATEGORY_SLUGS[cat]}`,
						changefreq: "monthly",
						priority: CATEGORY_SLUGS[cat] === "open-source" ? 0.9 : 0.5,
						lastmod: lastChecked(CATEGORY_SLUGS[cat] === "open-source" ? openSourceTools() : toolsInCategory(cat)),
					})),
				];

				// Editorial programmatic sections.
				const glossaryPages: SitemapEntry[] = [
					{
						path: "/glossary",
						changefreq: "monthly",
						priority: 0.7,
						lastmod: newest(glossaryTerms.map((item) => item.updated)),
					},
					...glossaryTerms.map((t) => ({
						path: `/glossary/${t.slug}`,
						changefreq: "monthly",
						priority: 0.5,
						lastmod: t.updated,
					})),
				];

				const featurePages: SitemapEntry[] = productFeatures.map((f) => ({
					path: `/features/${f.slug}`,
					changefreq: "monthly",
					priority: 0.7,
					lastmod: f.updated,
				}));

				const aiSearchPages: SitemapEntry[] = [
					{
						path: "/ai-search",
						changefreq: "monthly",
						priority: 0.7,
						lastmod: newest(aiSearchEngines.map((item) => item.updated)),
					},
					...aiSearchEngines.map((e) => ({
						path: `/ai-search/${e.slug}`,
						changefreq: "monthly",
						priority: 0.6,
						lastmod: e.updated,
					})),
				];

				const aeoForPages: SitemapEntry[] = [
					{
						path: "/aeo-for",
						changefreq: "monthly",
						priority: 0.7,
						lastmod: newest(aeoVerticals.map((item) => item.updated)),
					},
					{ path: "/aeo-for/profound-users", changefreq: "monthly", priority: 0.6, lastmod: "2026-10-08" },
					...aeoVerticals.map((v) => ({
						path: `/aeo-for/${v.slug}`,
						changefreq: "monthly",
						priority: 0.6,
						lastmod: v.updated,
					})),
				];

				const releases = await getGitHubReleases();
				const listingDates: Record<string, string | undefined> = {
					"/features": newest(productFeatures.map((item) => item.updated)),
					"/docs": newest(docsPages.map((page) => page.lastmod)),
					"/blog": newest(blogPages.map((page) => page.lastmod)),
					"/legal": newest(legalPages.map((page) => page.lastmod)),
					"/roadmap": upcomingData.lastUpdated,
					"/status": new Date().toISOString().slice(0, 10),
					"/changelog": newest(releases.map((release) => release.published_at.slice(0, 10))),
				};

				const allPages: SitemapEntry[] = [
					...staticPages.map((page) => ({ ...page, lastmod: page.lastmod ?? listingDates[page.path] })),
					...featurePages,
					...docsPages,
					...legalPages,
					...blogPages,
					...comparisonPages,
					...directorySubPages,
					...glossaryPages,
					...aiSearchPages,
					...aeoForPages,
				];

				const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
	.map(
		(page) => `  <url>
    <loc>${SITE_URL}${page.path}</loc>${page.lastmod ? `\n    <lastmod>${page.lastmod}</lastmod>` : ""}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
	)
	.join("\n")}
</urlset>`;

				return new Response(sitemap, {
					headers: { "Content-Type": "application/xml" },
				});
			},
		},
	},
});
