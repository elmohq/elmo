import { createFileRoute, notFound } from "@tanstack/react-router";
import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import { OG_FONTS } from "@workspace/og/fonts";
import { renderOgPng } from "@workspace/og/rasterize";
import { OG_HEIGHT, OG_WIDTH, renderOgImage } from "@workspace/og/render";
import { SITE_URL } from "@/lib/seo";
import { source } from "@/lib/source";

export const Route = createFileRoute("/og/docs/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const slugs = (params._splat?.split("/") ?? []).slice(0, -1);
				const page = source.getPage(slugs);
				if (!page) throw notFound();

				const png = await renderOgPng(
					renderOgImage({
						appName: DEFAULT_APP_NAME,
						title: page.data.title,
						description: page.data.description,
						label: "Docs",
						url: SITE_URL,
					}),
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
