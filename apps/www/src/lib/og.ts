export function getPageImage(slugs: string[]) {
	const segments = [...slugs, "image.png"];

	return {
		segments,
		url: `/og/docs/${segments.join("/")}`,
	};
}
