import { createFileRoute } from "@tanstack/react-router";
import { OG_FONTS } from "@workspace/og/fonts";
import { renderOgPng } from "@workspace/og/rasterize";
import { OG_HEIGHT, OG_WIDTH } from "@workspace/og/render";
import { loadStatusData } from "@/lib/status";
import { renderStatusOgImage } from "@/lib/status-og";

export const Route = createFileRoute("/og/status.png")({
	server: {
		handlers: {
			GET: async () => {
				const data = await loadStatusData();

				const png = await renderOgPng(renderStatusOgImage(data), {
					width: OG_WIDTH,
					height: OG_HEIGHT,
					fonts: OG_FONTS,
				});

				return new Response(png, {
					headers: {
						"Content-Type": "image/png",
						"Cache-Control": "public, max-age=300, s-maxage=1800",
					},
				});
			},
		},
	},
});
