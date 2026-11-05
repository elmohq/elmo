import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import { OG_FONTS } from "@workspace/og/fonts";
import { renderOgPng } from "@workspace/og/rasterize";
import { OG_HEIGHT, OG_WIDTH, renderOgImage } from "@workspace/og/render";
import { SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/og.png")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const title = url.searchParams.get("title") ?? undefined;
				const description = url.searchParams.get("description") ?? undefined;
				const label = url.searchParams.get("label") ?? undefined;

				const png = await renderOgPng(
					renderOgImage({ appName: DEFAULT_APP_NAME, title, description, label, url: SITE_URL }),
					{ width: OG_WIDTH, height: OG_HEIGHT, fonts: OG_FONTS },
				);

				return new Response(png, {
					headers: {
						"Content-Type": "image/png",
						"Cache-Control": "public, max-age=86400, s-maxage=604800",
					},
				});
			},
		},
	},
});
