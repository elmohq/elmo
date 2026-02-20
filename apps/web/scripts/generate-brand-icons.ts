#!/usr/bin/env tsx
/**
 * Generates static Elmo brand icon SVGs with the Titan One font embedded.
 *
 * Output directory: apps/web/public/icons/
 *
 * Icons produced:
 *   - elmo-icon.svg          Standard "e" icon (transparent background)
 *   - elmo-icon-maskable.svg Maskable variant with extra padding for safe-zone
 *
 * Both embed the Titan One WOFF2 font as base64 so they are fully self-contained.
 *
 * Usage:
 *   npx tsx apps/web/scripts/generate-brand-icons.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BRAND_COLOR = "#2563eb";
const OUTPUT_DIR = resolve(__dirname, "../public/icons");

function loadFontBase64(): string {
	const fontPath = require.resolve(
		"@fontsource/titan-one/files/titan-one-latin-400-normal.woff2",
	);
	return readFileSync(fontPath).toString("base64");
}

function fontFaceRule(base64: string): string {
	return `@font-face { font-family: 'Titan One'; src: url(data:font/woff2;base64,${base64}) format('woff2'); }`;
}

/**
 * Standard icon — "e" filling nearly the entire 128×128 viewBox, transparent bg.
 *
 * Titan One's lowercase "e" x-height is ~62% of the em size.
 * At font-size 190 the glyph is ~118px tall — nearly filling the 128 box.
 * The y baseline is set so the glyph is vertically centered.
 */
function buildStandardIcon(fontBase64: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <style>${fontFaceRule(fontBase64)}</style>
  <text x="50%" y="93.5%" font-family="'Titan One', sans-serif" font-size="190" font-weight="400" fill="${BRAND_COLOR}" text-anchor="middle">e</text>
</svg>`;
}

/**
 * Maskable icon — "e" inside the safe-zone (inner ~80%) of a 128×128 box.
 * White background so adaptive icon contexts have a clean fill.
 * The glyph is sized to nearly fill the safe area.
 */
function buildMaskableIcon(fontBase64: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <style>${fontFaceRule(fontBase64)}</style>
  <rect width="128" height="128" fill="#ffffff"/>
  <text x="50%" y="78%" font-family="'Titan One', sans-serif" font-size="120" font-weight="400" fill="${BRAND_COLOR}" text-anchor="middle">e</text>
</svg>`;
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const fontBase64 = loadFontBase64();

const icons = [
	{ name: "elmo-icon.svg", build: buildStandardIcon },
	{ name: "elmo-icon-maskable.svg", build: buildMaskableIcon },
];

for (const { name, build } of icons) {
	const outPath = resolve(OUTPUT_DIR, name);
	writeFileSync(outPath, build(fontBase64), "utf-8");
	console.log(`  ✓ ${name}`);
}

console.log(`\nIcons written to ${OUTPUT_DIR}`);
