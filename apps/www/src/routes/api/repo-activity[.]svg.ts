import { createFileRoute } from "@tanstack/react-router";
import { getRepoActivityData } from "@/lib/repo-activity/cache";
import { renderFallback, renderRepoActivity } from "@/lib/repo-activity/svg";

/**
 * Self-hosted, brand-matched repository-activity SVG — a replacement for the
 * external Repobeats embed that caches in Upstash (5-minute freshness) and
 * filters out bot contributors.
 *
 *   /api/repo-activity.svg
 */
export const Route = createFileRoute("/api/repo-activity.svg")({
	server: {
		handlers: {
			GET: async () => {
				let svg: string;
				try {
					const data = await getRepoActivityData();
					svg = renderRepoActivity(data);
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
