/**
 * /api/og - Dynamic Open Graph image
 *
 * Generates a 1200×630 PNG OG image using the current deployment's branding.
 * Elmo deployments get the Titan One logo + accent gradient; whitelabel
 * deployments show their icon + app name.
 *
 * Heavily cached — branding doesn't change without a redeploy.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getDeployment } from "@/lib/config/server";
import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import { generateOgImage } from "@/lib/og-image";

async function fetchIconAsDataUri(
	iconPath: string,
	appUrl: string,
): Promise<string | undefined> {
	const url = iconPath.startsWith("http")
		? iconPath
		: `${appUrl.replace(/\/$/, "")}${iconPath}`;
	try {
		const res = await fetch(url);
		if (!res.ok) return undefined;
		const buf = await res.arrayBuffer();
		const contentType = res.headers.get("content-type") || "image/png";
		return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
	} catch {
		return undefined;
	}
}

export const Route = createFileRoute("/api/og/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const forceDefault = url.searchParams.get("defaultBranding") === "true";

				const deployment = getDeployment();
				const { branding } = deployment;

				const appName = forceDefault ? DEFAULT_APP_NAME : branding.name;

				let iconDataUri: string | undefined;
				if (!forceDefault && appName !== DEFAULT_APP_NAME && branding.icon) {
					iconDataUri = await fetchIconAsDataUri(
						branding.icon,
						branding.url,
					);
				}

				const png = await generateOgImage({
					appName,
					accentColors: forceDefault ? undefined : branding.chartColors.slice(0, 4),
					iconDataUri,
				});

				return new Response(new Uint8Array(png), {
					headers: {
						"Content-Type": "image/png",
						"Cache-Control": "public, max-age=86400, s-maxage=604800",
					},
				});
			},
		},
	},
});
