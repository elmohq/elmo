import { type FontLoader, Renderer } from "@takumi-rs/core";
import { fromJsx } from "@takumi-rs/helpers/jsx";
import type { ReactNode } from "react";

export interface RasterizeOptions {
	width: number;
	height: number;
	fonts: FontLoader[];
}

// Process-wide so the parsed font faces are reused across cards.
const renderer = new Renderer();

/** Lay out a React element with Takumi and encode it as a PNG. */
export async function renderOgPng(
	element: ReactNode,
	{ width, height, fonts }: RasterizeOptions,
): Promise<Buffer<ArrayBuffer>> {
	const { node, css } = await fromJsx(element);
	return renderer.render(node, { width, height, format: "png", css, fonts });
}
