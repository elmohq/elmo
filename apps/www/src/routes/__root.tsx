/// <reference types="vite/client" />
import { useEffect, type ReactNode } from "react";
import {
	Outlet,
	createRootRoute,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { initPostHog } from "@/lib/posthog";
import {
	SITE_URL,
	SITE_NAME,
	SITE_DESCRIPTION,
	websiteJsonLd,
	organizationJsonLd,
} from "@/lib/seo";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: `${SITE_NAME} · Open Source AI Visibility Platform` },
			{ name: "description", content: SITE_DESCRIPTION },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:locale", content: "en_US" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "theme-color", content: "#2563eb" },
			{ name: "apple-mobile-web-app-title", content: SITE_NAME },
		],
		links: [
			{ rel: "icon", type: "image/svg+xml", href: "/icons/elmo-icon.svg" },
			{ rel: "icon", type: "image/png", sizes: "96x96", href: "/icons/elmo-icon-96.png" },
			{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "manifest", href: "/site.webmanifest" },
			{ rel: "canonical", href: SITE_URL },
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
	component: RootComponent,
});

function RootComponent() {
	useEffect(() => {
		initPostHog();
	}, []);

	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="flex min-h-screen flex-col">
				<RootProvider
					theme={{
						defaultTheme: "light",
						forcedTheme: "light",
					}}
				>
					{children}
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
