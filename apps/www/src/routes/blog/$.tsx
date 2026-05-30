import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { BlogPostLayout } from "@/components/blog-post-layout";
import { resolveAuthor } from "@/data/authors";
import { blogPostingJsonLd, breadcrumbJsonLd, canonicalUrl, ogMeta, SITE_NAME } from "@/lib/seo";

export interface BlogPostLoaderData {
	slugs: string[];
	/** Collection-relative file path, passed to the browser client loader. */
	path: string;
	title: string;
	description: string;
	date: string;
	author: string;
	tags: string[];
}

export const Route = createFileRoute("/blog/$")({
	component: Page,
	head: ({ loaderData }) => {
		const data = loaderData as BlogPostLoaderData | undefined;
		if (!data) return {};

		const { title, description, date, author, slugs } = data;
		const pageTitle = `${title} · ${SITE_NAME}`;
		const pageDescription = description || `${title} — from the ${SITE_NAME} blog.`;
		const path = `/blog/${slugs.join("/")}`;
		const resolved = resolveAuthor(author);
		const authorName =
			resolved.kind === "team" ? resolved.author.name : resolved.kind === "unknown" ? resolved.name : undefined;

		return {
			meta: [
				{ title: pageTitle },
				{ name: "description", content: pageDescription },
				...ogMeta({
					title: pageTitle,
					description: pageDescription,
					path,
					type: "article",
				}),
			],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				blogPostingJsonLd({
					title,
					description: pageDescription,
					path,
					datePublished: date,
					authorName,
				}),
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "Blog", path: "/blog" },
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
	.handler(async ({ data: slugs }): Promise<BlogPostLoaderData> => {
		// Lazy import keeps the server-only blog source out of the client bundle
		// (see the note in @/lib/blog and the same pattern in routes/docs/$.tsx).
		const { blogSource } = await import("@/lib/blog");
		const page = blogSource.getPage(slugs);
		if (!page) throw notFound();

		return {
			slugs,
			path: page.path,
			title: page.data.title,
			description: page.data.description ?? "",
			date: page.data.date,
			author: page.data.author,
			tags: page.data.tags ?? [],
		};
	});

function Page() {
	const loaderData = Route.useLoaderData() as BlogPostLoaderData;
	return <BlogPostLayout data={loaderData} />;
}
