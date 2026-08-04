import { createFileRoute } from "@tanstack/react-router";
import titanOne400Data from "virtual:font/titan-one-400";
import geistSans400Data from "virtual:font/geist-sans-400";
import geistSans500Data from "virtual:font/geist-sans-500";
import { renderOgPng } from "@workspace/og/rasterize";
import { loadStatusData } from "@/lib/status";
import { renderStatusOgImage } from "@/lib/status-og";

export const Route = createFileRoute("/og/status.png")({
	server: {
		handlers: {
			GET: async () => {
				const data = await loadStatusData();

				const png = await renderOgPng(renderStatusOgImage(data), {
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
