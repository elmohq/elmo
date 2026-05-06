import { getMarketingOgImage } from "./og";

export const SITE_URL = "https://www.elmohq.com";
export const SITE_NAME = "Elmo";
export const SITE_DESCRIPTION =
	"Open source AI visibility tracking and optimization.";
export const SITE_LOGO_URL = `${SITE_URL}/brand/icons/elmo-icon-512.png`;

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
	const resolvedImage = image ?? getMarketingOgImage({ title, description });
	const absoluteImage = resolvedImage.startsWith("http")
		? resolvedImage
		: canonicalUrl(resolvedImage);

	return [
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ property: "og:url", content: url },
		{ property: "og:site_name", content: SITE_NAME },
		{ property: "og:type", content: type },
		{ property: "og:locale", content: "en_US" },
		{ property: "og:image", content: absoluteImage },
		{ property: "og:image:width", content: "1200" },
		{ property: "og:image:height", content: "630" },
		{ property: "og:logo", content: SITE_LOGO_URL },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
		{ name: "twitter:image", content: absoluteImage },
	];
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
		logo: SITE_LOGO_URL,
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
