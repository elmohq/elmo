import { createFileRoute } from "@tanstack/react-router";
import { getRepobeatsData } from "@/lib/repobeats/cache";
import { renderFallback, renderRepobeats, resolveVariant } from "@/lib/repobeats/svg";
import { resolveTheme } from "@/lib/repobeats/theme";

/**
 * Self-hosted, brand-matched repository-activity SVG — a replacement for the
 * external Repobeats embed that caches in Upstash (5-minute freshness) and
 * filters out bot contributors.
 *
 *   /api/repobeats.svg?variant=pulse|dashboard|card&theme=light|dark|auto
 */
export const Route = createFileRoute("/api/repobeats.svg")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const variant = resolveVariant(url.searchParams.get("variant"));
				const theme = resolveTheme(url.searchParams.get("theme"));

				let svg: string;
				try {
					const data = await getRepobeatsData();
					svg = renderRepobeats(data, { variant, theme });
				} catch {
					svg = renderFallback(theme);
				}

				return new Response(svg, {
					headers: {
						"Content-Type": "image/svg+xml; charset=utf-8",
						"Cache-Control":
							"public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
					},
				});
			},
		},
	},
});
