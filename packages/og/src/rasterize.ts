import { type FontLoader, Renderer } from "@takumi-rs/core";
import { fromJsx } from "@takumi-rs/helpers/jsx";
import type { ReactNode } from "react";

export interface RasterizeOptions {
	width: number;
	height: number;
	fonts: FontLoader[];
}

// Process-wide because the renderer owns the font and image caches: it dedupes
// repeated `fonts` registrations, so every card after the first reuses the
// parsed faces.
const renderer = new Renderer();

/**
 * Lay out a React element with Takumi and encode it as a PNG. Takumi's font
 * parser handles TTF/OTF/WOFF/WOFF2.
 */
export async function renderOgPng(
	element: ReactNode,
	{ width, height, fonts }: RasterizeOptions,
): Promise<Buffer<ArrayBuffer>> {
	const { node, css } = await fromJsx(element);
	return renderer.render(node, { width, height, format: "png", css, fonts });
}
