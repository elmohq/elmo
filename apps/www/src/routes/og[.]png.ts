import { createFileRoute } from "@tanstack/react-router";
import titanOne400Data from "virtual:font/titan-one-400";
import geistSans400Data from "virtual:font/geist-sans-400";
import geistSans500Data from "virtual:font/geist-sans-500";
import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import { renderOgPng } from "@workspace/og/rasterize";
import { renderOgImage } from "@workspace/og/render";

export const Route = createFileRoute("/og.png")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const title = url.searchParams.get("title") ?? undefined;
				const description = url.searchParams.get("description") ?? undefined;

				const png = await renderOgPng(
					renderOgImage({
						appName: DEFAULT_APP_NAME,
						title,
						description,
					}),
					{
						width: 1200,
						height: 630,
						fonts: [
							{
								name: "Titan One",
								data: titanOne400Data,
								style: "normal" as const,
								weight: 400 as const,
							},
							{
								name: "Geist Sans",
								data: geistSans400Data,
								style: "normal" as const,
								weight: 400 as const,
							},
							{
								name: "Geist Sans",
								data: geistSans500Data,
								style: "normal" as const,
								weight: 500 as const,
							},
						],
					},
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
