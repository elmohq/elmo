#!/usr/bin/env tsx
// biome-ignore lint/correctness/noUnusedImports: classic JSX transform needs React
import React from "react";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "@takumi-rs/image-response";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadFont(path: string): ArrayBuffer {
	const buf = readFileSync(require.resolve(path));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const fonts = [
	{
		name: "Titan One",
		data: loadFont(
			"@fontsource/titan-one/files/titan-one-latin-400-normal.woff2",
		),
		style: "normal" as const,
		weight: 400 as const,
	},
	{
		name: "Geist Sans",
		data: loadFont(
			"@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2",
		),
		style: "normal" as const,
		weight: 500 as const,
	},
	{
		name: "Geist Sans",
		data: loadFont(
			"@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2",
		),
		style: "normal" as const,
		weight: 600 as const,
	},
	{
		name: "Geist Sans",
		data: loadFont(
			"@fontsource/geist-sans/files/geist-sans-latin-700-normal.woff2",
		),
		style: "normal" as const,
		weight: 700 as const,
	},
	{
		name: "Geist Mono",
		data: loadFont(
			"@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2",
		),
		style: "normal" as const,
		weight: 500 as const,
	},
];

const BRAND_BLUE = "#2563eb";
const ZINC_50 = "#fafafa";
const ZINC_200 = "#e4e4e7";
const ZINC_400 = "#a1a1aa";
const ZINC_500 = "#71717a";
const ZINC_600 = "#52525b";
const ZINC_700 = "#3f3f46";
const ZINC_950 = "#09090b";

// ---------------------------------------------------------------------------
// Page variant — Mux poster on the homepage hero. Branding is already on the
// surrounding page, so the poster is reduced to a single "watch this"
// message at a size that survives the player's actual render width.
// ---------------------------------------------------------------------------

function loadDashboardDataUri(): string {
	const buf = readFileSync(
		resolve(__dirname, "../public/screenshots/overview.png"),
	);
	return `data:image/png;base64,${buf.toString("base64")}`;
}

function PagePoster({ dashboardSrc }: { dashboardSrc: string }) {
	return (
		<div
			style={{
				display: "flex",
				width: "100%",
				height: "100%",
				backgroundColor: ZINC_950,
				position: "relative",
			}}
		>
			{/* dashboard fills the frame, blurred at render time */}
			<img
				src={dashboardSrc}
				alt=""
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
					objectFit: "cover",
					filter: "blur(14px) saturate(0.9)",
				}}
			/>
			{/* dark veil pulls the image back so the play button reads cleanly */}
			<div
				style={{
					display: "flex",
					position: "absolute",
					inset: 0,
					backgroundColor: "rgba(9,9,11,0.55)",
				}}
			/>
			{/* vignette dims the corners and concentrates light at the center */}
			<div
				style={{
					display: "flex",
					position: "absolute",
					inset: 0,
					backgroundImage:
						"radial-gradient(ellipse 55% 60% at 50% 50%, transparent 0%, rgba(9,9,11,0.55) 100%)",
				}}
			/>
			{/* soft blue glow behind the play button — brand accent */}
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: "50%",
					top: "50%",
					width: 480,
					height: 480,
					marginLeft: -240,
					marginTop: -240,
					borderRadius: 999,
					backgroundImage:
						"radial-gradient(circle, rgba(37,99,235,0.35) 0%, transparent 65%)",
				}}
			/>
			{/* outer halo ring */}
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: "50%",
					top: "50%",
					width: 280,
					height: 280,
					marginLeft: -140,
					marginTop: -140,
					borderRadius: 999,
					border: "1px solid rgba(255,255,255,0.12)",
				}}
			/>
			{/* inner ring — sits just outside the Mux play button */}
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: "50%",
					top: "50%",
					width: 200,
					height: 200,
					marginLeft: -100,
					marginTop: -100,
					borderRadius: 999,
					border: "1.5px solid rgba(255,255,255,0.22)",
				}}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// YouTube variant — white field, brand-blue wordmark, "Open-source AEO" as
// the dominant headline. Echoes the hero section: white background, faint
// dot grid, Geist semibold, sparing blue accent.
// ---------------------------------------------------------------------------

function YouTubeThumbnail() {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				width: "100%",
				height: "100%",
				padding: 80,
				backgroundColor: "#ffffff",
				position: "relative",
			}}
		>
			<div
				style={{
					display: "flex",
					position: "absolute",
					inset: 0,
					backgroundImage:
						"radial-gradient(rgba(0,0,0,0.11) 1.8px, transparent 1.8px)",
					backgroundSize: "34px 34px",
				}}
			/>
			<div
				style={{
					display: "flex",
					position: "absolute",
					inset: 0,
					backgroundImage:
						"radial-gradient(ellipse 70% 60% at 100% 100%, rgba(37,99,235,0.18) 0%, transparent 60%)",
				}}
			/>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					position: "relative",
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Titan One",
						fontSize: 88,
						color: BRAND_BLUE,
						lineHeight: 1,
					}}
				>
					elmo
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						padding: "10px 18px",
						borderRadius: 999,
						border: `1.5px solid ${ZINC_200}`,
						backgroundColor: "#ffffff",
					}}
				>
					<div
						style={{
							display: "flex",
							width: 10,
							height: 10,
							borderRadius: 999,
							backgroundColor: BRAND_BLUE,
						}}
					/>
					<div
						style={{
							display: "flex",
							fontFamily: "Geist Mono",
							fontWeight: 500,
							fontSize: 22,
							color: ZINC_600,
							letterSpacing: 2,
							textTransform: "uppercase",
						}}
					>
						Product demo
					</div>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 28,
					position: "relative",
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Geist Sans",
						fontWeight: 700,
						fontSize: 168,
						color: ZINC_950,
						lineHeight: 1.0,
						letterSpacing: -6,
					}}
				>
					Open Source
				</div>
				<div
					style={{
						display: "flex",
						fontFamily: "Geist Sans",
						fontWeight: 700,
						fontSize: 168,
						color: BRAND_BLUE,
						lineHeight: 1.0,
						letterSpacing: -6,
					}}
				>
					AEO
				</div>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					position: "relative",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 14,
					}}
				>
					<div
						style={{
							display: "flex",
							width: 6,
							height: 32,
							backgroundColor: BRAND_BLUE,
							borderRadius: 2,
						}}
					/>
					<div
						style={{
							display: "flex",
							fontFamily: "Geist Sans",
							fontWeight: 500,
							fontSize: 32,
							color: ZINC_700,
						}}
					>
						Track your brand across every AI model.
					</div>
				</div>
				<div
					style={{
						display: "flex",
						fontFamily: "Geist Mono",
						fontWeight: 500,
						fontSize: 24,
						color: ZINC_500,
						letterSpacing: 1,
					}}
				>
					elmohq.com
				</div>
			</div>
		</div>
	);
}

async function render(
	element: React.ReactElement,
	out: string,
): Promise<void> {
	const response = new ImageResponse(element, {
		width: 1280,
		height: 720,
		fonts,
	});
	writeFileSync(out, Buffer.from(await response.arrayBuffer()));
	console.log(`Wrote ${out}`);
}

async function main() {
	const dashboardSrc = loadDashboardDataUri();
	// Page poster ships with the site as a static asset so MuxPlayer can use
	// it as the `poster` while the video metadata loads.
	await render(
		<PagePoster dashboardSrc={dashboardSrc} />,
		resolve(__dirname, "../public/demo-poster.png"),
	);
	// YouTube variant is hand-uploaded; keep it out of the repo.
	await render(
		<YouTubeThumbnail />,
		resolve(__dirname, "../../../.context/demo-poster-youtube.png"),
	);
}

main();
