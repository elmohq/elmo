import { createFileRoute } from "@tanstack/react-router";
import { refreshRepoActivitySnapshot } from "@/lib/repo-activity/cache";

/**
 * Cron target (Vercel Cron): recomputes the repo-activity snapshot and writes it to
 * Upstash so `/repo-activity.svg` only ever reads a warm cache and never blocks a
 * request on GitHub's API — the slow refetch is what makes Camo time out and show a
 * broken image on the README.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations; reject
 * anything else so the ~14-call GitHub refresh can't be triggered by the public.
 *
 *   /api/repo-activity/refresh
 */
export const Route = createFileRoute("/api/repo-activity/refresh")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const secret = process.env.CRON_SECRET;
				if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
					return new Response("Unauthorized", { status: 401 });
				}

				try {
					const data = await refreshRepoActivitySnapshot();
					return new Response(JSON.stringify({ ok: true, commitWeeks: data.commitsByWeek.length }), {
						headers: { "Content-Type": "application/json" },
					});
				} catch (error) {
					console.error("repo-activity refresh failed", error);
					return new Response("Refresh failed", { status: 500 });
				}
			},
		},
	},
});
