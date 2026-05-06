export function getPageImage(slugs: string[]) {
	const segments = [...slugs, "image.png"];

	return {
		segments,
		url: `/og/docs/${segments.join("/")}`,
	};
}

export function getMarketingOgImage(opts: {
	title: string;
	description?: string;
}): string {
	// The rendered card already shows the "elmo" logo, so a "Pricing · Elmo" or
	// "Elmo · Open Source AI Visibility Platform" title would render the brand
	// twice. Strip the brand prefix/suffix here. The og:title meta keeps the
	// full string for crawlers — only the image gets the cleaner version.
	const cleanTitle = opts.title
		.replace(/^Elmo\s*[·\-|:]\s*/i, "")
		.replace(/\s*[·\-|:]\s*Elmo$/i, "");
	const params = new URLSearchParams();
	params.set("title", cleanTitle);
	if (opts.description) params.set("description", opts.description);
	return `/og.png?${params.toString()}`;
}
