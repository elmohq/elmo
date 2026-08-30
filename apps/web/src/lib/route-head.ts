import { routeSubjects } from "@/lib/route-subject";

const DEFAULT_DESCRIPTION = "Track and optimize your brand's visibility across AI models.";

interface RouteMatchContext {
	context?: {
		clientConfig?: {
			branding?: { name?: string; url?: string; icon?: string };
		};
	};
}

export function getAppName(match: RouteMatchContext): string {
	return match.context?.clientConfig?.branding?.name || "Elmo";
}

/**
 * Get the absolute base URL for the deployment, with no trailing slash.
 * Used to build canonical / og:url / og:image absolute URLs.
 */
export function getAppUrl(match: RouteMatchContext): string | undefined {
	const url = match.context?.clientConfig?.branding?.url;
	return url ? url.replace(/\/$/, "") : undefined;
}

export function buildTitle(pageName: string, opts: { appName: string; subject?: string }): string {
	if (opts.subject) {
		return `${pageName} | ${opts.subject} · ${opts.appName}`;
	}
	return `${pageName} · ${opts.appName}`;
}

interface HeadArgs {
	match: RouteMatchContext & { staticData?: { crumb?: string } };
	matches: Array<{ routeId: string; context?: unknown; loaderData?: unknown }>;
}

export function pageHead(page: { title?: string; description?: string }) {
	return ({ match, matches }: HeadArgs) => {
		const { organizationName, brandName } = routeSubjects(matches);
		const name = page.title ?? match.staticData?.crumb;
		const appName = getAppName(match);
		return {
			meta: [
				{ title: name ? buildTitle(name, { appName, subject: brandName ?? organizationName }) : appName },
				...(page.description ? [{ name: "description", content: page.description }] : []),
			],
		};
	};
}

function toAbsolute(appUrl: string | undefined, path: string): string {
	if (path.startsWith("http")) return path;
	if (!appUrl) return path;
	return `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Build OG / Twitter Card meta tags for a page.
 *
 * Points og:image at the dynamic /api/og endpoint which renders a brand-aware
 * PNG. The endpoint accepts ?title=…&description=… so each page can render its
 * own social card. URLs are absolute when an appUrl is supplied — required by
 * crawlers like Facebook, Twitter, and Slack.
 */
export function buildOgMeta(opts: {
	title: string;
	description?: string;
	path?: string;
	appUrl?: string;
}): Array<Record<string, string>> {
	const description = opts.description || DEFAULT_DESCRIPTION;

	const ogImageParams = new URLSearchParams();
	ogImageParams.set("title", opts.title);
	ogImageParams.set("description", description);
	const ogImageUrl = toAbsolute(opts.appUrl, `/api/og?${ogImageParams.toString()}`);

	const meta: Array<Record<string, string>> = [
		{ property: "og:title", content: opts.title },
		{ property: "og:description", content: description },
		{ property: "og:image", content: ogImageUrl },
		{ property: "og:image:width", content: "1200" },
		{ property: "og:image:height", content: "630" },
		{ property: "og:type", content: "website" },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: opts.title },
		{ name: "twitter:description", content: description },
		{ name: "twitter:image", content: ogImageUrl },
	];

	if (opts.path && opts.appUrl) {
		meta.push({
			property: "og:url",
			content: toAbsolute(opts.appUrl, opts.path),
		});
	}

	return meta;
}
