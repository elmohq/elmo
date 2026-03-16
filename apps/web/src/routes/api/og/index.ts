import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname } from "node:path";
import { createElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import geistSans400Url from "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff?url";
import geistSans500Url from "@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff?url";
import titanOne400Url from "@fontsource/titan-one/files/titan-one-latin-400-normal.woff?url";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import {
	DEFAULT_APP_NAME,
	ELMO_BRAND_COLOR,
} from "@workspace/config/constants";
import { getDeployment } from "@/lib/config/server";

const ACCENT_COLORS = ["#2563eb", "#f4d35e", "#ee964b", "#f95738"];
const DEFAULT_TAGLINE = "AI Search Optimization";
const DEFAULT_DESCRIPTION =
	"Track and optimize your brand's visibility across AI models.";

const fontDataCache = new Map<string, Promise<ArrayBuffer>>();
const require = createRequire(import.meta.url);
const publicDir = new URL("../../../../public/", import.meta.url);

let wasmReady: Promise<void> | undefined;

function ensureWasm(request: Request): Promise<void> {
	if (!wasmReady) {
		if (import.meta.env.DEV) {
			wasmReady = Promise.resolve().then(async () => {
				const buffer = readFileSync(
					require.resolve("@resvg/resvg-wasm/index_bg.wasm"),
				);
				await initWasm(buffer);
			});
		} else {
			const url = new URL(resvgWasmUrl, request.url);
			wasmReady = fetch(url)
				.then((res) => res.arrayBuffer())
				.then((buf) => initWasm(buf));
		}
	}
	return wasmReady;
}

async function fetchIconAsDataUri(
	iconPath: string,
	appUrl: string,
	requestUrl: string,
): Promise<string | undefined> {
	const readPublicIcon = (pathname: string): string | undefined => {
		try {
			const iconFile = new URL(`.${pathname}`, publicDir);
			const buffer = readFileSync(iconFile);
			const extension = extname(pathname).toLowerCase();
			const contentType =
				extension === ".svg"
					? "image/svg+xml"
					: extension === ".jpg" || extension === ".jpeg"
						? "image/jpeg"
						: extension === ".webp"
							? "image/webp"
							: "image/png";
			return `data:${contentType};base64,${buffer.toString("base64")}`;
		} catch {
			return undefined;
		}
	};

	if (iconPath.startsWith("/")) {
		return readPublicIcon(iconPath);
	}

	const url = iconPath.startsWith("http")
		? iconPath
		: `${appUrl.replace(/\/$/, "")}${iconPath}`;

	try {
		const iconUrl = new URL(url);
		const currentUrl = new URL(requestUrl);
		if (
			iconUrl.origin === currentUrl.origin &&
			iconUrl.pathname.startsWith("/")
		) {
			return readPublicIcon(iconUrl.pathname);
		}
	} catch {
		return undefined;
	}

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
		if (!res.ok) return undefined;
		const buf = await res.arrayBuffer();
		const contentType = res.headers.get("content-type") || "image/png";
		return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
	} catch {
		return undefined;
	}
}

function loadFontData(
	request: Request,
	cacheKey: string,
	assetUrl: string,
	packagePath: string,
): Promise<ArrayBuffer> {
	let cached = fontDataCache.get(cacheKey);
	if (!cached) {
		if (import.meta.env.DEV) {
			cached = Promise.resolve().then(() => {
				const buffer = readFileSync(require.resolve(packagePath));
				return buffer.buffer.slice(
					buffer.byteOffset,
					buffer.byteOffset + buffer.byteLength,
				);
			});
		} else {
			const url = new URL(assetUrl, request.url);
			cached = fetch(url).then(async (response) => {
				if (!response.ok) {
					throw new Error(
						`Failed to load font asset: ${url.pathname}`,
					);
				}
				return response.arrayBuffer();
			});
		}
		fontDataCache.set(cacheKey, cached);
	}
	return cached;
}

interface OgImageOptions {
	appName: string;
	title?: string;
	description?: string;
	accentColors?: string[];
	iconDataUri?: string;
}

function renderOgImage({
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

	return createElement(
		"div",
		{
			style: {
				display: "flex",
				width: "100%",
				height: "100%",
				position: "relative",
				overflow: "hidden",
				backgroundColor: "#ffffff",
			},
		},
		isElmo
			? createElement(
					"div",
					{
						style: {
							position: "absolute",
							fontFamily: "Titan One",
							fontSize: 700,
							color: watermarkColor,
							lineHeight: 1,
							right: -60,
							top: -60,
						},
					},
					"e",
				)
			: null,
		createElement(
			"div",
			{
				style: {
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					height: "100%",
					paddingLeft: 80,
					paddingRight: 80,
				},
			},
			isElmo
				? createElement(
						"div",
						{
							style: {
								fontFamily: "Titan One",
								fontSize: 80,
								color: ELMO_BRAND_COLOR,
								lineHeight: 1,
								marginBottom: 28,
							},
						},
						"elmo",
					)
				: iconDataUri
					? createElement("img", {
							src: iconDataUri,
							width: 120,
							height: 120,
							style: { marginBottom: 28, objectFit: "contain" },
						})
					: null,
			createElement(
				"div",
				{
					style: {
						fontFamily: "Geist Sans",
						fontSize: 44,
						fontWeight: 500,
						color: "#1e293b",
						lineHeight: 1.2,
						marginBottom: 16,
					},
				},
				isElmo ? (title || DEFAULT_TAGLINE) : appName,
			),
			createElement(
				"div",
				{
					style: {
						fontFamily: "Geist Sans",
						fontSize: 24,
						color: "#64748b",
					},
				},
				desc,
			),
		),
		createElement("div", {
			style: {
				display: "flex",
				position: "absolute",
				bottom: 0,
				left: 0,
				width: "100%",
				height: 6,
				backgroundImage: `linear-gradient(to right, ${gradientColors.join(", ")})`,
			},
		}),
	);
}

export const Route = createFileRoute("/api/og/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const forceDefault =
					url.searchParams.get("defaultBranding") === "true";

				const deployment = getDeployment();
				const { branding } = deployment;

				const appName = forceDefault ? DEFAULT_APP_NAME : branding.name;

				let iconDataUri: string | undefined;
				if (
					!forceDefault &&
					appName !== DEFAULT_APP_NAME &&
					branding.icon
				) {
					iconDataUri = await fetchIconAsDataUri(
						branding.icon,
						branding.url,
						request.url,
					);
				}

				const [, titanOne400, geistSans400, geistSans500] =
					await Promise.all([
						ensureWasm(request),
						loadFontData(
							request,
							"titan-one-400",
							titanOne400Url,
							"@fontsource/titan-one/files/titan-one-latin-400-normal.woff",
						),
						loadFontData(
							request,
							"geist-sans-400",
							geistSans400Url,
							"@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff",
						),
						loadFontData(
							request,
							"geist-sans-500",
							geistSans500Url,
							"@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff",
						),
					]);

				const svg = await satori(
					renderOgImage({
						appName,
						accentColors: forceDefault
							? undefined
							: branding.chartColors.slice(0, 4),
						iconDataUri,
					}),
					{
						width: 1200,
						height: 630,
						fonts: [
							{
								name: "Titan One",
								data: titanOne400,
								style: "normal" as const,
								weight: 400 as const,
							},
							{
								name: "Geist Sans",
								data: geistSans400,
								style: "normal" as const,
								weight: 400 as const,
							},
							{
								name: "Geist Sans",
								data: geistSans500,
								style: "normal" as const,
								weight: 500 as const,
							},
						],
					},
				);

				const resvg = new Resvg(svg, {
					fitTo: { mode: "width", value: 1200 },
				});
				const png = resvg.render().asPng();

				return new Response(Buffer.from(png), {
					headers: {
						"Content-Type": "image/png",
						"Cache-Control":
							"public, max-age=86400, s-maxage=604800",
					},
				});
			},
		},
	},
});
