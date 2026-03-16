#!/usr/bin/env tsx
/**
 * Generates the Elmo brand kit as a zip of PNGs using Takumi (JSX → Image).
 *
 * Output: apps/web/elmo-brand-kit.zip
 *
 *   Icons (square, "e" glyph):
 *     elmo-icon-{size}.png              Transparent background
 *     elmo-icon-white-{size}.png        White background
 *     elmo-icon-dark-{size}.png         Dark background
 *     elmo-icon-maskable-{size}.png     Maskable/PWA (white bg, safe-zone padding)
 *
 *   Logos ("elmo" wordmark, sm/md/lg × 3 backgrounds):
 *     elmo-logo[-white|-dark]-{sm|md|lg}.png
 *
 *   OG images (1200×630):
 *     og-default.png                    Default Open Graph image
 *
 *   Social banners:
 *     twitter-banner.png                1500×500 (Twitter/X header)
 *     linkedin-banner.png               1584×396 (LinkedIn personal)
 *
 * Usage:
 *   pnpm --filter @workspace/web generate-brand-kit
 */
import { readFileSync, createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "@takumi-rs/image-response";
import archiver from "archiver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BRAND_COLOR = "#2563eb";
const ACCENT_COLORS = ["#2563eb", "#f4d35e", "#ee964b", "#f95738"];
const TAGLINE = "AI Search Optimization";
const DESCRIPTION = "Track and optimize your brand's visibility across AI models.";
const OUTPUT_ZIP = resolve(__dirname, "../elmo-brand-kit.zip");

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

function loadFont(path: string): ArrayBuffer {
	const buf = readFileSync(require.resolve(path));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const fonts = [
	{
		name: "Titan One",
		data: loadFont("@fontsource/titan-one/files/titan-one-latin-400-normal.woff2"),
		style: "normal" as const,
		weight: 400 as const,
	},
	{
		name: "Geist Sans",
		data: loadFont("@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2"),
		style: "normal" as const,
		weight: 400 as const,
	},
	{
		name: "Geist Sans",
		data: loadFont("@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2"),
		style: "normal" as const,
		weight: 500 as const,
	},
];

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

async function render(
	element: React.ReactElement,
	width: number,
	height: number,
): Promise<Buffer> {
	const response = new ImageResponse(element, {
		width,
		height,
		fonts,
	});
	return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Icon — "e" glyph scaled to fill the canvas
// ---------------------------------------------------------------------------

function Icon({ fill, bg, size }: { fill: string; bg?: string; size: number }) {
	return (
		<div
			tw="flex items-center justify-center w-full h-full"
			style={{ backgroundColor: bg || "transparent" }}
		>
			<div
				style={{
					fontFamily: "Titan One",
					fontSize: size,
					color: fill,
					lineHeight: 1,
					transform: "scale(1.4)",
					marginTop: -Math.round(size * 0.28),
				}}
			>
				e
			</div>
		</div>
	);
}

function MaskableIcon({ size }: { size: number }) {
	return (
		<div tw="flex items-center justify-center w-full h-full bg-white">
			<div
				style={{
					fontFamily: "Titan One",
					fontSize: Math.round(size * 0.94),
					color: BRAND_COLOR,
					lineHeight: 1,
					marginTop: -Math.round(size * 0.18),
				}}
			>
				e
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Logo — "elmo" wordmark with equal padding on all sides
// ---------------------------------------------------------------------------

function Logo({ bg, fontSize }: { bg?: string; fontSize: number }) {
	return (
		<div
			tw="flex items-center justify-center w-full h-full"
			style={{ backgroundColor: bg || "transparent" }}
		>
			<div
				style={{
					fontFamily: "Titan One",
					fontSize,
					color: BRAND_COLOR,
					lineHeight: 1,
				}}
			>
				elmo
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Banner — logo + tagline + description
// ---------------------------------------------------------------------------

function Banner({
	height,
	variant,
}: {
	height: number;
	variant: "dark" | "light";
}) {
	const isDark = variant === "dark";
	const bg = isDark ? BRAND_COLOR : "#ffffff";
	const taglineFill = isDark ? "rgba(255,255,255,0.88)" : "#1e293b";
	const descFill = isDark ? "rgba(255,255,255,0.55)" : "#64748b";
	const watermarkColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(37,99,235,0.06)";

	const s = height / 380;

	return (
		<div
			tw="flex w-full h-full relative overflow-hidden"
			style={{ backgroundColor: bg }}
		>
			<div
				style={{
					position: "absolute",
					fontFamily: "Titan One",
					fontSize: Math.round(height * 1.4),
					color: watermarkColor,
					lineHeight: 1,
					right: Math.round(-height * 0.1),
					top: Math.round(-height * 0.2),
				}}
			>
				e
			</div>

			<div
				tw="flex flex-col justify-center h-full"
				style={{ paddingLeft: Math.round(80 * s), paddingRight: Math.round(80 * s) }}
			>
				<div
					style={{
						fontFamily: "Titan One",
						fontSize: Math.round(64 * s),
						color: isDark ? "#ffffff" : BRAND_COLOR,
						lineHeight: 1,
						marginBottom: Math.round(18 * s),
					}}
				>
					elmo
				</div>
			<div
				style={{
					fontFamily: "Geist Sans",
					fontSize: Math.round(28 * s),
					fontWeight: 500,
					color: taglineFill,
					marginBottom: Math.round(10 * s),
				}}
			>
				{TAGLINE}
			</div>
		<div style={{ fontFamily: "Geist Sans", fontSize: Math.round(18 * s), color: descFill, marginBottom: Math.round(14 * s) }}>
			{DESCRIPTION}
		</div>
		<div style={{ fontFamily: "Geist Sans", fontSize: Math.round(14 * s), color: isDark ? "rgba(255,255,255,0.3)" : "#94a3b8" }}>
			elmohq.com · github.com/elmohq/elmo
		</div>
		</div>

			<div
				style={{
					display: "flex",
					position: "absolute",
					bottom: 0,
					left: 0,
					width: "100%",
					height: 6,
					backgroundImage: `linear-gradient(to right, ${ACCENT_COLORS.join(", ")})`,
				}}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// OG image
// ---------------------------------------------------------------------------

function OgImage({ title }: { title: string }) {
	return (
		<div
			tw="flex w-full h-full relative overflow-hidden"
			style={{ backgroundColor: "#ffffff" }}
		>
			<div
				style={{
					position: "absolute",
					fontFamily: "Titan One",
					fontSize: 700,
					color: "rgba(37,99,235,0.04)",
					lineHeight: 1,
					right: -60,
					top: -60,
				}}
			>
				e
			</div>

			<div tw="flex flex-col justify-center h-full" style={{ paddingLeft: 80, paddingRight: 80 }}>
				<div
					style={{
						fontFamily: "Titan One",
						fontSize: 80,
						color: BRAND_COLOR,
						lineHeight: 1,
						marginBottom: 28,
					}}
				>
					elmo
				</div>
			<div
				style={{
					fontFamily: "Geist Sans",
					fontSize: 44,
					fontWeight: 500,
					color: "#1e293b",
					marginBottom: 16,
				}}
			>
				{title}
			</div>
			<div style={{ fontFamily: "Geist Sans", fontSize: 24, color: "#64748b" }}>
				{DESCRIPTION}
			</div>
			</div>

			<div
				style={{
					display: "flex",
					position: "absolute",
					bottom: 0,
					left: 0,
					width: "100%",
					height: 6,
					backgroundImage: `linear-gradient(to right, ${ACCENT_COLORS.join(", ")})`,
				}}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Generate all assets
// ---------------------------------------------------------------------------

const files: { name: string; data: Buffer }[] = [];

async function addFile(name: string, data: Buffer | Promise<Buffer>) {
	const resolved = await data;
	files.push({ name, data: resolved });
	console.log(`  ✓ ${name}`);
}

console.log("Generating brand kit…\n");

// Icons — always brand blue, bg varies
const iconVariants = [
	{ suffix: "", bg: undefined },
	{ suffix: "-white", bg: "#ffffff" },
	{ suffix: "-dark", bg: "#111827" },
];
const iconSizes = [16, 32, 64, 128, 256, 512];

console.log("Icons:");
for (const v of iconVariants) {
	for (const size of iconSizes) {
		await addFile(
			`icons/elmo-icon${v.suffix}-${size}.png`,
			render(<Icon fill={BRAND_COLOR} bg={v.bg} size={size} />, size, size),
		);
	}
}

console.log("\nIcons — Maskable (PWA):");
for (const size of [64, 128, 256, 512]) {
	await addFile(
		`icons/elmo-icon-maskable-${size}.png`,
		render(<MaskableIcon size={size} />, size, size),
	);
}

// Logos — always brand blue text
console.log("\nLogos:");
const logoBgs = [
	{ suffix: "", bg: undefined },
	{ suffix: "-white", bg: "#ffffff" },
	{ suffix: "-dark", bg: "#111827" },
];
const logoSizes = [
	{ label: "sm", fontSize: 64, w: 190, h: 90 },
	{ label: "md", fontSize: 100, w: 290, h: 140 },
	{ label: "lg", fontSize: 160, w: 470, h: 220 },
	{ label: "xl", fontSize: 240, w: 700, h: 330 },
	{ label: "2xl", fontSize: 360, w: 1050, h: 500 },
];
for (const bg of logoBgs) {
	for (const sz of logoSizes) {
		await addFile(
			`logos/elmo-logo${bg.suffix}-${sz.label}.png`,
			render(<Logo bg={bg.bg} fontSize={sz.fontSize} />, sz.w, sz.h),
		);
	}
}

// OG
console.log("\nOG Images:");
const ogData = await render(<OgImage title={TAGLINE} />, 1200, 630);
files.push({ name: "og/og-default.png", data: ogData });
console.log("  ✓ og/og-default.png  (1200×630)");

// Banners
console.log("\nSocial Banners:");
const bannerVariants = [
	{ name: "twitter-banner.png", w: 1500, h: 500, variant: "light" as const },
	{ name: "linkedin-banner.png", w: 1584, h: 396, variant: "light" as const },
];
for (const b of bannerVariants) {
	await addFile(
		`banners/${b.name}`,
		render(<Banner height={b.h} variant={b.variant} />, b.w, b.h),
	);
}

// Write zip
console.log("\nPacking zip…");

const output = createWriteStream(OUTPUT_ZIP);
const archive = archiver("zip", { zlib: { level: 9 } });

const done = new Promise<void>((res, rej) => {
	output.on("close", res);
	archive.on("error", rej);
});

archive.pipe(output);

for (const file of files) {
	archive.append(file.data, { name: file.name });
}

await archive.finalize();
await done;

const zipSize = readFileSync(OUTPUT_ZIP).length;
const kb = (zipSize / 1024).toFixed(1);
console.log(
	`\n✅ elmo-brand-kit.zip (${kb} KB, ${files.length} files) → ${OUTPUT_ZIP}`,
);
