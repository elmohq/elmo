/// <reference types="vite/client" />

// Preload the 400-weight files used everywhere above the fold so they download
// in parallel with the CSS instead of after it (the H1 LCP element was being
// held back by the HTML→CSS→font waterfall).
import geistMonoFont from "@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2?url";
import geistSansFont from "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2?url";
import titanOneFont from "@fontsource/titan-one/files/titan-one-latin-400-normal.woff2?url";
import { Asset, createRootRoute, Outlet, Scripts, useTags } from "@tanstack/react-router";
import { CookieConsentBanner } from "@workspace/ui/consent/cookie-consent-banner";
import { isConsentRequired } from "@workspace/ui/lib/cookie-consent";
import { type ReactNode, useEffect, useState } from "react";
import { NotFound } from "@/components/not-found";
import { getConsentRegion } from "@/lib/consent-region";
import { initCrisp } from "@/lib/crisp";
import { getGitHubStars } from "@/lib/github-stars";
import { getMarketingOgImage } from "@/lib/og";
import { initAnalytics } from "@/lib/posthog";
import { organizationJsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_URL, websiteJsonLd } from "@/lib/seo";
import appCss from "../styles.css?url";

const ROOT_TITLE = `${SITE_NAME} · Open Source AI Visibility`;
const ROOT_OG_IMAGE = `${SITE_URL}${getMarketingOgImage({ title: ROOT_TITLE, description: SITE_DESCRIPTION })}`;

export const Route = createRootRoute({
	notFoundComponent: NotFound,
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: ROOT_TITLE },
			{ name: "description", content: SITE_DESCRIPTION },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:locale", content: "en_US" },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: SITE_URL },
			{ property: "og:title", content: ROOT_TITLE },
			{ property: "og:description", content: SITE_DESCRIPTION },
			{ property: "og:image", content: ROOT_OG_IMAGE },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:image:alt", content: ROOT_TITLE },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: ROOT_TITLE },
			{ name: "twitter:description", content: SITE_DESCRIPTION },
			{ name: "twitter:image", content: ROOT_OG_IMAGE },
			{ name: "theme-color", content: "#2563eb" },
			{ name: "apple-mobile-web-app-title", content: SITE_NAME },
		],
		links: [
			{
				rel: "preload",
				as: "font",
				type: "font/woff2",
				href: geistSansFont,
				crossOrigin: "anonymous",
			},
			{
				rel: "preload",
				as: "font",
				type: "font/woff2",
				href: geistMonoFont,
				crossOrigin: "anonymous",
			},
			{
				rel: "preload",
				as: "font",
				type: "font/woff2",
				href: titanOneFont,
				crossOrigin: "anonymous",
			},
			{ rel: "icon", type: "image/svg+xml", href: "/icons/elmo-icon.svg" },
			{ rel: "icon", type: "image/png", sizes: "96x96", href: "/icons/elmo-icon-96.png" },
			{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "manifest", href: "/site.webmanifest" },
			{ rel: "stylesheet", href: appCss },
		],
		scripts: [
			websiteJsonLd(),
			organizationJsonLd(),
			{
				src: "/api/plausible/js/script",
				defer: true,
				"data-domain": "elmohq.com",
				"data-api": "/api/plausible/event",
			},
		],
	}),
	loader: async () => {
		const [githubStars, consentRegion] = await Promise.all([getGitHubStars(), getConsentRegion()]);
		return { githubStars, consentRegion };
	},
	component: RootComponent,
});

function RootComponent() {
	const { consentRegion } = Route.useLoaderData();
	// Null until the browser resolves it — the time-zone fallback would read the
	// server's own zone during SSR.
	const [consentRequired, setConsentRequired] = useState<boolean | null>(null);

	useEffect(() => {
		const required = isConsentRequired(consentRegion);
		setConsentRequired(required);
		initCrisp();
		return initAnalytics(required);
	}, [consentRegion]);

	return (
		<RootDocument>
			<Outlet />
			{consentRequired !== null && (
				<CookieConsentBanner consentRequired={consentRequired} policyHref="/legal/cookies" />
			)}
		</RootDocument>
	);
}

// Pages are server-rendered, so hydration JS shouldn't compete with CSS, fonts, and images.
function PageHead() {
	return useTags().map((tag) => {
		const lowered = tag.tag === "link" && tag.attrs?.rel === "modulepreload";
		return (
			<Asset
				{...tag}
				attrs={lowered ? { ...tag.attrs, fetchPriority: "low" } : tag.attrs}
				key={`tsr-meta-${JSON.stringify(tag)}`}
			/>
		);
	});
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<PageHead />
			</head>
			<body className="flex min-h-screen flex-col">
				{children}
				<Scripts />
			</body>
		</html>
	);
}
