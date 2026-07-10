import { createFileRoute } from "@tanstack/react-router";
import { readRepoActivitySnapshot } from "@/lib/repo-activity/cache";
import { CACHE_TTL_SECONDS } from "@/lib/repo-activity/constants";
import { renderFallback, renderRepoActivity } from "@/lib/repo-activity/svg";

/**
 * Self-hosted, brand-matched repository-activity SVG for the README — a replacement
 * for the external Repobeats embed. Serves a warm Upstash snapshot that a Vercel cron
 * keeps fresh, so the response is instant and never blocks on GitHub (a slow refetch
 * on the request is what makes Camo time out to a broken image).
 *
 *   /repo-activity.svg
 */
export const Route = createFileRoute("/repo-activity.svg")({
	server: {
		handlers: {
			GET: async () => {
				let svg: string;
				try {
					const data = await readRepoActivitySnapshot();
					svg = data ? renderRepoActivity(data) : renderFallback();
				} catch {
					svg = renderFallback();
				}

				return new Response(svg, {
					headers: {
						"Content-Type": "image/svg+xml; charset=utf-8",
						// max-age is how often Camo revalidates the README image; the cron keeps
						// the snapshot warm so each revalidation reads instantly. No long
						// stale-while-revalidate — that let Camo serve a day-old image after
						// max-age expired.
						"Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
					},
				});
			},
		},
	},
});
