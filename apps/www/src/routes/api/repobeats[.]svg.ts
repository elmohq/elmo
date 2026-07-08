import { createFileRoute } from "@tanstack/react-router";
import { getRepobeatsData } from "@/lib/repobeats/cache";
import { renderFallback, renderRepobeats } from "@/lib/repobeats/svg";

/**
 * Self-hosted, brand-matched repository-activity SVG — a replacement for the
 * external Repobeats embed that caches in Upstash (5-minute freshness) and
 * filters out bot contributors.
 *
 *   /api/repobeats.svg
 */
export const Route = createFileRoute("/api/repobeats.svg")({
	server: {
		handlers: {
			GET: async () => {
				let svg: string;
				try {
					const data = await getRepobeatsData();
					svg = renderRepobeats(data);
				} catch {
					svg = renderFallback();
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
