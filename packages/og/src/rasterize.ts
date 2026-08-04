import { Resvg } from "@resvg/resvg-js";
import type { ReactNode } from "react";
import satori, { type SatoriOptions } from "satori";

export interface RasterizeOptions {
	width: number;
	height: number;
	fonts: SatoriOptions["fonts"];
}

/**
 * Lay out a React element with Satori (JSX/CSS → SVG) and rasterize it to PNG
 * with resvg. Satori's font parser handles TTF/OTF/WOFF (not WOFF2).
 *
 * resvg is a native addon; the app vite configs mark it external and trace it
 * into the Nitro output so the server bundler never tries to inline its `.node`.
 */
export async function renderOgPng(
	element: ReactNode,
	{ width, height, fonts }: RasterizeOptions,
): Promise<ArrayBuffer> {
	const svg = await satori(element, { width, height, fonts });
	const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
	return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
}
