/** @jsxRuntime automatic */
// The pragma keeps this file rendering under tsx (the brand-kit script), which
// compiles it outside any tsconfig that sets the automatic JSX runtime.
import { DEFAULT_APP_NAME, ELMO_BRAND_COLOR } from "@workspace/config/constants";
import type { ReactNode } from "react";

export const ACCENT_COLORS = ["#2563eb", "#f4d35e", "#ee964b", "#f95738"];
export const DEFAULT_TAGLINE = "AI Search Optimization";
export const DEFAULT_DESCRIPTION = "Track and optimize your brand's visibility across AI models.";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const PADDING = 64;
const GRID_CELL = 48;

const ZINC = {
	950: "#09090b",
	700: "#3f3f46",
	600: "#52525b",
	500: "#71717a",
	200: "#e4e4e7",
} as const;

// Satori renders these: every element with more than one child needs
// display:flex, styles are inline, and only the faces in OG_FONTS exist
// (Titan One 400, Geist Sans 400/500, Geist Mono 400).
const SANS = "Geist Sans";
const MONO = "Geist Mono";
const WORDMARK = "Titan One";

function withAlpha(color: string, alpha: number): string | undefined {
	const hex = color.trim().replace(/^#/, "");
	const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
	if (!/^[0-9a-f]{6}$/i.test(full)) return undefined;
	const n = Number.parseInt(full, 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export interface OgFrameOptions {
	/** Accent colors for the top bar (and the glow, from the first one). */
	accentColors: string[];
	/** Bottom-left footer text, usually the site host. */
	footer?: string;
	children: ReactNode;
}

/**
 * The shared card chrome: white canvas, the faint fading grid the marketing site
 * uses behind its hero, a soft accent glow, a segmented brand bar along the top
 * edge, and a mono footer. Content is laid out in a column inside the padding.
 */
export function OgFrame({ accentColors, footer, children }: OgFrameOptions) {
	const colors = accentColors.length > 0 ? [...new Set(accentColors)] : [ZINC[950]];
	const glow = withAlpha(colors[0], 0.16);
	const gridLines = (extent: number) =>
		Array.from({ length: Math.floor(extent / GRID_CELL) }, (_, i) => (i + 1) * GRID_CELL);

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				position: "relative",
				overflow: "hidden",
				backgroundColor: "#ffffff",
				fontFamily: SANS,
				color: ZINC[950],
			}}
		>
			<div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
				{gridLines(OG_WIDTH).map((left) => (
					<div
						key={`v${left}`}
						style={{
							position: "absolute",
							top: 0,
							left,
							width: 1,
							height: "100%",
							backgroundColor: "rgba(9,9,11,0.06)",
						}}
					/>
				))}
				{gridLines(OG_HEIGHT).map((top) => (
					<div
						key={`h${top}`}
						style={{
							position: "absolute",
							left: 0,
							top,
							width: "100%",
							height: 1,
							backgroundColor: "rgba(9,9,11,0.06)",
						}}
					/>
				))}
			</div>
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: "100%",
					height: "100%",
					backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0) 30%, rgba(255,255,255,1) 92%)",
				}}
			/>
			{glow ? (
				<div
					style={{
						position: "absolute",
						top: -260,
						right: -260,
						width: 900,
						height: 900,
						backgroundImage: `radial-gradient(circle, ${glow} 0%, rgba(255,255,255,0) 60%)`,
					}}
				/>
			) : null}
			<div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "100%", height: 8 }}>
				{colors.map((color) => (
					<div key={color} style={{ flex: 1, height: "100%", backgroundColor: color }} />
				))}
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					position: "relative",
					flex: 1,
					paddingTop: PADDING - 8,
					paddingBottom: PADDING - 12,
					paddingLeft: PADDING,
					paddingRight: PADDING,
				}}
			>
				{children}
				{footer ? (
					<div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
						<div style={{ fontFamily: MONO, fontSize: 22, color: ZINC[500], letterSpacing: 0.5 }}>{footer}</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

export function OgLabel({ children }: { children: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				fontFamily: MONO,
				fontSize: 22,
				letterSpacing: 0.5,
				color: ZINC[700],
				paddingTop: 10,
				paddingBottom: 10,
				paddingLeft: 20,
				paddingRight: 20,
				borderRadius: 999,
				borderWidth: 1,
				borderStyle: "solid",
				borderColor: ZINC[200],
				backgroundColor: "#ffffff",
			}}
		>
			{children}
		</div>
	);
}

export interface OgHeaderOptions {
	appName: string;
	iconDataUri?: string;
	/** Short context shown as a pill on the right, e.g. "Docs" or "Blog". */
	label?: string;
}

/** Wordmark (or whitelabel icon + name) on the left, optional label pill on the right. */
export function OgHeader({ appName, iconDataUri, label }: OgHeaderOptions) {
	const isElmo = appName === DEFAULT_APP_NAME;
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
			{isElmo ? (
				<div style={{ fontFamily: WORDMARK, fontSize: 60, lineHeight: 1, color: ELMO_BRAND_COLOR }}>elmo</div>
			) : (
				<div style={{ display: "flex", alignItems: "center" }}>
					{iconDataUri ? (
						<img
							src={iconDataUri}
							alt=""
							width={56}
							height={56}
							style={{ marginRight: 20, objectFit: "contain", borderRadius: 12 }}
						/>
					) : null}
					<div style={{ fontSize: 40, fontWeight: 500, letterSpacing: -0.5, color: ZINC[950] }}>{appName}</div>
				</div>
			)}
			{label ? <OgLabel>{label}</OgLabel> : null}
		</div>
	);
}

// Scale the headline to its length so a nine-word blog title and a one-word
// docs page both fill the card without wrapping past three lines.
function titleFontSize(title: string): number {
	const n = title.length;
	if (n <= 22) return 92;
	if (n <= 40) return 80;
	if (n <= 60) return 68;
	if (n <= 85) return 58;
	return 50;
}

export interface OgImageOptions {
	appName: string;
	title?: string;
	description?: string;
	accentColors?: string[];
	iconDataUri?: string;
	label?: string;
	/** Site or app URL; only its host is shown, in the footer. */
	url?: string;
}

function hostOf(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		return new URL(url).host.replace(/^www\./, "");
	} catch {
		return undefined;
	}
}

export function renderOgImage({ appName, title, description, accentColors, iconDataUri, label, url }: OgImageOptions) {
	const isElmo = appName === DEFAULT_APP_NAME;
	const colors = isElmo ? ACCENT_COLORS : (accentColors?.filter(Boolean).slice(0, 4) ?? []);
	const heading = title || DEFAULT_TAGLINE;
	const fontSize = titleFontSize(heading);
	const short = fontSize >= 80;

	return (
		<OgFrame accentColors={colors} footer={hostOf(url)}>
			<OgHeader appName={appName} iconDataUri={iconDataUri} label={label} />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					flex: 1,
					paddingTop: 24,
					paddingBottom: 24,
				}}
			>
				<div
					style={{
						fontSize,
						fontWeight: 500,
						lineHeight: 1.08,
						letterSpacing: -fontSize * 0.03,
						color: ZINC[950],
						lineClamp: 3,
						textWrap: "balance",
					}}
				>
					{heading}
				</div>
				<div
					style={{
						marginTop: short ? 28 : 22,
						maxWidth: 920,
						fontSize: short ? 32 : 28,
						lineHeight: 1.4,
						color: ZINC[600],
						lineClamp: short ? 3 : 2,
						textWrap: "balance",
					}}
				>
					{description || DEFAULT_DESCRIPTION}
				</div>
			</div>
		</OgFrame>
	);
}
