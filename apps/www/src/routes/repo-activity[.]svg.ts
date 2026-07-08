import { createFileRoute } from "@tanstack/react-router";
import { getRepoActivityData } from "@/lib/repo-activity/cache";
import { CACHE_TTL_SECONDS } from "@/lib/repo-activity/constants";
import { renderFallback, renderRepoActivity } from "@/lib/repo-activity/svg";

/**
 * Self-hosted, brand-matched repository-activity SVG — a replacement for the
 * external Repobeats embed that caches in Upstash (5-minute freshness) and
 * filters out bot contributors.
 *
 *   /repo-activity.svg
 */
export const Route = createFileRoute("/repo-activity.svg")({
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
						// Match our snapshot lifetime so GitHub's Camo proxy refreshes the
						// README at the same cadence. No long stale-while-revalidate — that
						// let Camo serve a day-old image after max-age expired.
						"Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
					},
				});
			},
		},
	},
});
