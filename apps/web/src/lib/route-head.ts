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
 *   "PageName - BrandName | AppName"  (with brand context)
 *   "PageName | AppName"              (without brand context)
 */
export function buildTitle(
	pageName: string,
	opts: { appName: string; brandName?: string },
): string {
	if (opts.brandName) {
		return `${pageName} - ${opts.brandName} | ${opts.appName}`;
	}
	return `${pageName} | ${opts.appName}`;
}
