export const SITE_URL = "https://www.elmohq.com";
export const SITE_NAME = "Elmo";
export const SITE_DESCRIPTION =
	"Track how ChatGPT, Claude, and Google AI Overviews talk about your brand. Self-hosted, transparent, and free.";

export function canonicalUrl(path: string): string {
	return `${SITE_URL}${path}`;
}

export function ogMeta({
	title,
	description,
	path,
	image,
	type = "website",
}: {
	title: string;
	description: string;
	path: string;
	image?: string;
	type?: "website" | "article";
}) {
	const url = canonicalUrl(path);
	const meta = [
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ property: "og:url", content: url },
		{ property: "og:site_name", content: SITE_NAME },
		{ property: "og:type", content: type },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
	];

	if (image) {
		meta.push(
			{ property: "og:image", content: image.startsWith("http") ? image : canonicalUrl(image) },
			{ name: "twitter:image", content: image.startsWith("http") ? image : canonicalUrl(image) },
		);
	}

	return meta;
}

export function jsonLd(data: Record<string, unknown>): {
	type: string;
	children: string;
} {
	return {
		type: "application/ld+json",
		children: JSON.stringify({ "@context": "https://schema.org", ...data }),
	};
}

export function websiteJsonLd() {
	return jsonLd({
		"@type": "WebSite",
		name: SITE_NAME,
		url: SITE_URL,
		description: SITE_DESCRIPTION,
	});
}

export function organizationJsonLd() {
	return jsonLd({
		"@type": "Organization",
		name: SITE_NAME,
		url: SITE_URL,
		logo: `${SITE_URL}/brand/icons/elmo-icon-512.png`,
		sameAs: ["https://github.com/elmohq/elmo"],
	});
}

export function softwareApplicationJsonLd() {
	return jsonLd({
		"@type": "SoftwareApplication",
		name: SITE_NAME,
		description: SITE_DESCRIPTION,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Any",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
		url: SITE_URL,
	});
}

export function articleJsonLd({
	title,
	description,
	path,
}: {
	title: string;
	description: string;
	path: string;
}) {
	return jsonLd({
		"@type": "TechArticle",
		headline: title,
		description,
		url: canonicalUrl(path),
		publisher: {
			"@type": "Organization",
			name: SITE_NAME,
			url: SITE_URL,
		},
	});
}

export function breadcrumbJsonLd(
	items: { name: string; path: string }[],
) {
	return jsonLd({
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: canonicalUrl(item.path),
		})),
	});
}
