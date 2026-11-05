import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import { renderOgPng } from "@workspace/og/rasterize";
import { OG_HEIGHT, OG_WIDTH, type OgImageOptions, renderOgImage } from "@workspace/og/render";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

function loadFont(spec: string): Buffer {
	return readFileSync(require.resolve(spec));
}

const fonts = [
	{ name: "Titan One", data: loadFont("@fontsource/titan-one/files/titan-one-latin-400-normal.woff2"), weight: 400 },
	{ name: "Geist Sans", data: loadFont("@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2"), weight: 400 },
	{ name: "Geist Sans", data: loadFont("@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2"), weight: 500 },
	{ name: "Geist Mono", data: loadFont("@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2"), weight: 400 },
].map((font) => ({ ...font, style: "normal" as const, weight: font.weight as 400 | 500 }));

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function renderCard(options: OgImageOptions) {
	const png = await renderOgPng(renderOgImage(options), { width: OG_WIDTH, height: OG_HEIGHT, fonts });
	expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
	// IHDR is the first chunk: width and height are the two big-endian ints after the 8-byte signature and 8-byte chunk header.
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const ONE_PIXEL_PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("Open Graph card", () => {
	it("renders the default Elmo card without a title or description", async () => {
		await expect(renderCard({ appName: DEFAULT_APP_NAME, url: "https://www.elmohq.com" })).resolves.toEqual({
			width: OG_WIDTH,
			height: OG_HEIGHT,
		});
	});

	it("keeps a full-size canvas when the title and description are far too long to fit", async () => {
		const title =
			"How to Track Your Brand's Visibility in ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews ".repeat(4);
		const description = "A step-by-step guide to measuring where your brand shows up in AI answers. ".repeat(10);
		await expect(
			renderCard({ appName: DEFAULT_APP_NAME, title, description, label: "Blog", url: "https://www.elmohq.com" }),
		).resolves.toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
	});

	it("renders whitelabel cards with and without an icon", async () => {
		const base = {
			appName: "Acme Insights",
			description: "Track and optimize your brand's visibility across AI models.",
			url: "https://insights.acme.com",
		};
		await expect(
			renderCard({ ...base, accentColors: ["#0f766e", "#f59e0b"], iconDataUri: ONE_PIXEL_PNG }),
		).resolves.toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
		await expect(renderCard({ ...base, accentColors: ["not-a-color"] })).resolves.toEqual({
			width: OG_WIDTH,
			height: OG_HEIGHT,
		});
	});
});
