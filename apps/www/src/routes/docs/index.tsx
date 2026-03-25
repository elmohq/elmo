import { createFileRoute } from "@tanstack/react-router";
import {
	serverLoader,
	clientLoader,
	DocsPageLayout,
	type DocsLoaderData,
} from "./$";
import { getPageImage } from "@/lib/og";
import {
	SITE_NAME,
	ogMeta,
	canonicalUrl,
	breadcrumbJsonLd,
} from "@/lib/seo";

export const Route = createFileRoute("/docs/")({
	component: Page,
	head: ({ loaderData }) => {
		const data = loaderData as DocsLoaderData | undefined;
		if (!data) return {};

		const pageTitle = `Documentation — ${SITE_NAME}`;
		const pageDescription =
			data.description || `${SITE_NAME} documentation and guides.`;
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
	loader: async () => {
		const data = await serverLoader({ data: [] });
		await clientLoader.preload(data.path);
		return data;
	},
});

function Page() {
	const loaderData = Route.useLoaderData() as DocsLoaderData;
	return <DocsPageLayout loaderData={loaderData} />;
}
