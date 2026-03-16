/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { NotFound } from "@/router-default-components";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { NuqsAdapter } from "nuqs/adapters/react";
import type { QueryClient } from "@tanstack/react-query";
import { DEFAULT_APP_ICON } from "@workspace/config/constants";
import type { DeploymentMode } from "@workspace/config/types";
import type { MissingEnvVar } from "@workspace/config/env";
import { getClientConfig, getEnvValidationStateFn, type PublicClientConfig } from "@/server/config";
import MissingEnvPage from "@/components/missing-env-page";
import queryDevtools from "@/integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface RouterContext {
	queryClient: QueryClient;
	clientConfig: PublicClientConfig;
	envValidation: {
		mode: DeploymentMode;
		missing: MissingEnvVar[];
		isValid: boolean;
	};
}

// Client-side cache for config data — avoids HTTP round-trips on every SPA navigation.
// Server-side (SSR) always fetches fresh (cachedRootData is reset per request).
let cachedRootData: { clientConfig: PublicClientConfig; envValidation: { mode: DeploymentMode; missing: MissingEnvVar[]; isValid: boolean } } | null =
	typeof window === "undefined" ? null : null;

export const Route = createRootRouteWithContext<RouterContext>()({
	notFoundComponent: NotFound,
	beforeLoad: async () => {
		if (cachedRootData) return cachedRootData;
		const [clientConfig, envValidation] = await Promise.all([getClientConfig(), getEnvValidationStateFn()]);
		cachedRootData = { clientConfig, envValidation };
		return cachedRootData;
	},
	head: ({ match }) => {
		const branding = match.context?.clientConfig?.branding;
		const analytics = match.context?.clientConfig?.analytics;
		const scripts = [];
		if (analytics?.plausibleDomain) {
			scripts.push({
				src: "/api/plausible/js/script",
				defer: true,
				"data-domain": analytics.plausibleDomain,
				"data-api": "/api/plausible/event",
			});
		}
		if (analytics?.clarityProjectId) {
			scripts.push({
				children: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${analytics.clarityProjectId}");`,
			});
		}

		const hasCustomIcon = Boolean(branding?.icon && branding.icon !== DEFAULT_APP_ICON);

		const title = branding?.name
			? `${branding.name} - AI Search Optimization`
			: "Elmo - AI Search Optimization";
		const description = "Track and optimize your brand's visibility across AI models.";
		const ogImage = "/api/og";

		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:image", content: ogImage },
				{ property: "og:image:width", content: "1200" },
				{ property: "og:image:height", content: "630" },
				{ property: "og:type", content: "website" },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:image", content: ogImage },
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "manifest", href: "/api/manifest" },
				...(hasCustomIcon && branding?.icon
					? [{ rel: "icon", type: "image/png", href: branding.icon }]
					: [{ rel: "icon", type: "image/svg+xml", href: "/icons/elmo-icon.svg" }]),
			],
			scripts,
		};
	},
	component: RootComponent,
});

function RootComponent() {
	const { envValidation } = Route.useRouteContext();

	if (!envValidation.isValid) {
		return (
			<html lang="en">
				<head>
					<HeadContent />
				</head>
				<body className="font-sans antialiased">
					<MissingEnvPage mode={envValidation.mode} missing={envValidation.missing} />
					<Scripts />
				</body>
			</html>
		);
	}

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="font-sans antialiased">
				<NuqsAdapter>
					<Outlet />
				</NuqsAdapter>
				<TanStackDevtools plugins={[queryDevtools]} />
				<Scripts />
			</body>
		</html>
	);
}
