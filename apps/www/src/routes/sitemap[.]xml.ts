import { createFileRoute } from "@tanstack/react-router";
import { source } from "@/lib/source";
import { blogSource } from "@/lib/blog";
import { competitors, getComparisonSlug, isLowDR } from "@/lib/competitors";

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

const staticPages: SitemapEntry[] = [
	{ path: "/", changefreq: "weekly", priority: 1.0 },
	{ path: "/features", changefreq: "monthly", priority: 0.8 },
	{ path: "/pricing", changefreq: "monthly", priority: 0.8 },
	{ path: "/changelog", changefreq: "weekly", priority: 0.7 },
	{ path: "/roadmap", changefreq: "weekly", priority: 0.7 },
	{ path: "/docs", changefreq: "weekly", priority: 0.9 },
	{ path: "/blog", changefreq: "weekly", priority: 0.7 },
	{ path: "/ai-visibility-tools", changefreq: "weekly", priority: 0.8 },
	{ path: "/vision", changefreq: "monthly", priority: 0.6 },
	{ path: "/brand", changefreq: "monthly", priority: 0.5 },
	{ path: "/status", changefreq: "daily", priority: 0.5 },
];

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async () => {
			const docsPages: SitemapEntry[] = source.getPages().map((page) => ({
				path: page.url,
				changefreq: "weekly",
				priority: 0.7,
			}));

			const blogPages: SitemapEntry[] = blogSource.getPages().map((page) => ({
				path: page.url,
				changefreq: "monthly",
				priority: 0.7,
				// Real published date from frontmatter (schema normalizes to YYYY-MM-DD).
				lastmod: page.data.date,
			}));

			const comparisonPages: SitemapEntry[] = competitors
				.filter((c) => c.status !== "shutting-down" && c.category !== "other" && !isLowDR(c))
				.map((c) => ({
					path: `/ai-visibility-tools/${getComparisonSlug(c)}`,
					changefreq: "monthly",
					priority: 0.6,
				}));

			const allPages: SitemapEntry[] = [
				...staticPages,
				...docsPages,
				...blogPages,
				...comparisonPages,
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
