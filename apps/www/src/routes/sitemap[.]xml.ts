import { createFileRoute } from "@tanstack/react-router";
import { source } from "@/lib/source";
import { competitors, getComparisonSlug, isLowDR } from "@/lib/competitors";

const SITE_URL = "https://www.elmohq.com";

const staticPages = [
	{ path: "/", changefreq: "weekly", priority: 1.0 },
	{ path: "/features", changefreq: "monthly", priority: 0.8 },
	{ path: "/pricing", changefreq: "monthly", priority: 0.8 },
	{ path: "/changelog", changefreq: "weekly", priority: 0.7 },
	{ path: "/roadmap", changefreq: "weekly", priority: 0.7 },
	{ path: "/docs", changefreq: "weekly", priority: 0.9 },
	{ path: "/ai-visibility-tools", changefreq: "weekly", priority: 0.8 },
	{ path: "/brand", changefreq: "monthly", priority: 0.5 },
	{ path: "/status", changefreq: "daily", priority: 0.5 },
];

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async () => {
			const docsPages = source.getPages().map((page) => ({
				path: page.url,
				changefreq: "weekly",
				priority: 0.7,
			}));

			const comparisonPages = competitors
				.filter((c) => c.status !== "shutting-down" && c.category !== "other" && !isLowDR(c))
				.map((c) => ({
					path: `/ai-visibility-tools/${getComparisonSlug(c)}`,
					changefreq: "monthly",
					priority: 0.6,
				}));

			const allPages = [...staticPages, ...docsPages, ...comparisonPages];
				const now = new Date().toISOString().split("T")[0];

				const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
	.map(
		(page) => `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${now}</lastmod>
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
