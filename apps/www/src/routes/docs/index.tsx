import { createFileRoute } from "@tanstack/react-router";
import { DocsPageLayout } from "@/components/docs-page-layout";
import { getPageImage } from "@/lib/og";
import { breadcrumbJsonLd, canonicalUrl, ogMeta, SITE_NAME } from "@/lib/seo";
import { type LoaderData, serverLoader } from "./$";

export const Route = createFileRoute("/docs/")({
	component: Page,
	head: ({ loaderData }) => {
		const data = loaderData as LoaderData | undefined;
		if (!data) return {};

		const pageTitle = `Documentation · ${SITE_NAME}`;
		const pageDescription = data.description || `${SITE_NAME} documentation and guides.`;
		const image = getPageImage([]).url;

		return {
			meta: [
				{ title: pageTitle },
				{ name: "description", content: pageDescription },
				...ogMeta({
					title: pageTitle,
					description: pageDescription,
					path: "/docs",
					image,
				}),
			],
			links: [{ rel: "canonical", href: canonicalUrl("/docs") }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "Docs", path: "/docs" },
				]),
			],
		};
	},
	loader: async () => serverLoader({ data: [] }),
});

function Page() {
	const loaderData = Route.useLoaderData() as LoaderData;
	return <DocsPageLayout loaderData={loaderData} />;
}
