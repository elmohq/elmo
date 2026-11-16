import { createFileRoute } from "@tanstack/react-router";
import { cleanAndValidateDomain } from "@workspace/lib/citations/domain-categories";
import { upstreamFaviconUrl } from "@/lib/site-icon";

const DEFAULT_SIZE = 64;

// Raster only: an SVG served from our origin could run script if opened directly.
const ICON_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/x-icon",
	"image/vnd.microsoft.icon",
]);

const FOUND_CACHE = "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";
const MISSING_CACHE = "public, max-age=86400, s-maxage=86400";

export const Route = createFileRoute("/api/site-icon/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const params = new URL(request.url).searchParams;
				const domain = cleanAndValidateDomain(params.get("domain") ?? "");
				if (!domain) return new Response("Invalid domain", { status: 400 });

				const size = Number(params.get("size")) || DEFAULT_SIZE;

				let upstream: Response;
				try {
					upstream = await fetch(upstreamFaviconUrl(domain, size), { signal: AbortSignal.timeout(5000) });
				} catch {
					return new Response("Icon unavailable", { status: 502 });
				}

				// The service answers an unknown site with 404 and a generic globe; drop
				// the globe so the image errors and `SiteIcon` shows its own fallback.
				if (upstream.status === 404) {
					return new Response(null, { status: 404, headers: { "Cache-Control": MISSING_CACHE } });
				}

				const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
				if (!upstream.ok || !ICON_TYPES.has(contentType)) {
					return new Response("Icon unavailable", { status: 502 });
				}

				return new Response(await upstream.arrayBuffer(), {
					headers: {
						"Content-Type": contentType,
						"Cache-Control": FOUND_CACHE,
						"X-Content-Type-Options": "nosniff",
					},
				});
			},
		},
	},
});
