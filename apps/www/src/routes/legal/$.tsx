import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { LegalPageLayout } from "@/components/legal-page-layout";
import type { LegalPageSummary } from "@/lib/legal";
import { breadcrumbJsonLd, canonicalUrl, ogMeta, SITE_NAME } from "@/lib/seo";

export interface LegalLoaderData {
	slugs: string[];
	/** Collection-relative file path, passed to the browser client loader. */
	path: string;
	title: string;
	description: string;
	updated: string;
	/** Every policy, for the cross-links at the foot of the page. */
	pages: LegalPageSummary[];
}

export const Route = createFileRoute("/legal/$")({
	component: Page,
	head: ({ loaderData }) => {
		const data = loaderData as LegalLoaderData | undefined;
		if (!data) return {};

		const { title, description, slugs, updated } = data;
		const pageTitle = `${title} · ${SITE_NAME}`;
		const path = `/legal/${slugs.join("/")}`;

		return {
			meta: [
				{ title: pageTitle },
				{ name: "description", content: description },
				{ property: "article:modified_time", content: updated },
				...ogMeta({ title: pageTitle, description, path }),
			],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "Legal", path: "/legal" },
					{ name: title, path },
				]),
			],
		};
	},
	loader: async ({ params }) => {
		const slugs = params._splat?.split("/") ?? [];
		return await serverLoader({ data: slugs });
	},
});

export const serverLoader = createServerFn({ method: "GET" })
	.inputValidator((slugs: string[]) => slugs)
	.handler(async ({ data: slugs }): Promise<LegalLoaderData> => {
		// Lazy import keeps the server-only legal source out of the client bundle
		// (same pattern as routes/blog/$.tsx and routes/docs/$.tsx).
		const { legalSource, listLegalPages } = await import("@/lib/legal");
		const page = legalSource.getPage(slugs);
		if (!page) throw notFound();

		return {
			slugs,
			path: page.path,
			title: page.data.title,
			description: page.data.description ?? "",
			updated: page.data.updated,
			pages: listLegalPages(),
		};
	});

function Page() {
	const loaderData = Route.useLoaderData() as LegalLoaderData;
	return <LegalPageLayout data={loaderData} />;
}
