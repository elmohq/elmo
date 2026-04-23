/**
 * Helpers for building route head() meta tags.
 * Respects white-label / deployment branding configuration.
 */

/**
 * Get the app display name from route match context.
 * Returns the white-label branding name if configured, otherwise "Elmo".
 */
export function getAppName(match: {
	context?: { clientConfig?: { branding?: { name?: string } } };
}): string {
	return match.context?.clientConfig?.branding?.name || "Elmo";
}

/**
 * Get the brand name from the matched routes hierarchy.
 * Searches for the $brand layout match which stores brandName in loader data.
 */
export function getBrandName(
	matches: Array<{ loaderData?: Record<string, unknown> }>,
): string | undefined {
	for (const m of matches) {
		if (m.loaderData && typeof m.loaderData.brandName === "string") {
			return m.loaderData.brandName;
		}
	}
	return undefined;
}

/**
 * Build a page title following the convention:
 *   "PageName | BrandName · AppName"  (with brand context)
 *   "PageName · AppName"              (without brand context)
 */
export function buildTitle(
	pageName: string,
	opts: { appName: string; brandName?: string },
): string {
	if (opts.brandName) {
		return `${pageName} | ${opts.brandName} · ${opts.appName}`;
	}
	return `${pageName} · ${opts.appName}`;
}

/**
 * Build OG / Twitter Card meta tags for a page.
 * Points og:image at the dynamic /api/og endpoint which renders a brand-aware PNG.
 */
export function buildOgMeta(opts: {
	title: string;
	description?: string;
}): Array<Record<string, string>> {
	const description =
		opts.description ||
		"Track and optimize your brand's visibility across AI models.";
	const ogImageUrl = "/api/og";

	return [
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
}
