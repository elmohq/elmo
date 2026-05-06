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
	const params = new URLSearchParams();
	params.set("title", opts.title);
	if (opts.description) params.set("description", opts.description);
	return `/og.png?${params.toString()}`;
}
