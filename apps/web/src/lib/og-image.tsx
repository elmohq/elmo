/**
 * Dynamic OG image generation using Takumi (JSX → PNG).
 *
 * Adapts to the deployment's branding:
 *   - Elmo (local/demo): Titan One logo, blue brand color, accent gradient
 *   - Whitelabel: Geist Sans app name, chart-color accent
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ImageResponse } from "@takumi-rs/image-response";
import {
	DEFAULT_APP_NAME,
	ELMO_BRAND_COLOR,
} from "@workspace/config/constants";

const require = createRequire(import.meta.url);

const ACCENT_COLORS = ["#2563eb", "#f4d35e", "#ee964b", "#f95738"];
const DEFAULT_TAGLINE = "AI Search Optimization";
const DEFAULT_DESCRIPTION =
	"Track and optimize your brand's visibility across AI models.";

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
			"@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2",
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
];

export interface OgImageOptions {
	appName: string;
	title?: string;
	description?: string;
	accentColors?: string[];
	/** Data URI of the app icon — used for whitelabel instead of text logo */
	iconDataUri?: string;
}

function OgImageComponent({
	appName,
	title,
	description,
	accentColors,
	iconDataUri,
}: OgImageOptions) {
	const isElmo = appName === DEFAULT_APP_NAME;
	const brandColor = isElmo
		? ELMO_BRAND_COLOR
		: (accentColors?.[0] ?? "#1e293b");
	const desc = description || DEFAULT_DESCRIPTION;
	const watermarkColor = isElmo
		? "rgba(37,99,235,0.04)"
		: "rgba(0,0,0,0.03)";
	const gradientColors = isElmo
		? ACCENT_COLORS
		: accentColors && accentColors.length >= 2
			? accentColors.slice(0, 4)
			: [brandColor, brandColor];

	return (
		<div
			tw="flex w-full h-full relative overflow-hidden"
			style={{ backgroundColor: "#ffffff" }}
		>
			{isElmo && (
				<div
					style={{
						position: "absolute",
						fontFamily: "Titan One",
						fontSize: 700,
						color: watermarkColor,
						lineHeight: 1,
						right: -60,
						top: -60,
					}}
				>
					e
				</div>
			)}

			<div
				tw="flex flex-col justify-center h-full"
				style={{ paddingLeft: 80, paddingRight: 80 }}
			>
				{isElmo ? (
					<div
						style={{
							fontFamily: "Titan One",
							fontSize: 80,
							color: ELMO_BRAND_COLOR,
							lineHeight: 1,
							marginBottom: 28,
						}}
					>
						elmo
					</div>
				) : (
					iconDataUri && (
						<img
							src={iconDataUri}
							width={120}
							height={120}
							style={{ marginBottom: 28, objectFit: "contain" }}
						/>
					)
				)}
				<div
					style={{
						fontFamily: "Geist Sans",
						fontSize: 44,
						fontWeight: 500,
						color: "#1e293b",
						lineHeight: 1.2,
						marginBottom: 16,
					}}
				>
					{isElmo ? (title || DEFAULT_TAGLINE) : appName}
				</div>
				<div
					style={{
						fontFamily: "Geist Sans",
						fontSize: 24,
						color: "#64748b",
					}}
				>
					{desc}
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
					backgroundImage: `linear-gradient(to right, ${gradientColors.join(", ")})`,
				}}
			/>
		</div>
	);
}

export async function generateOgImage(
	options: OgImageOptions,
): Promise<Buffer> {
	const response = new ImageResponse(
		<OgImageComponent {...options} />,
		{ width: 1200, height: 630, fonts },
	);
	return Buffer.from(await response.arrayBuffer());
}
