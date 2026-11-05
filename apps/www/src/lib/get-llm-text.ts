import type { InferPageType } from "fumadocs-core/source";
import type { blogSource } from "@/lib/blog";
import { withFrontmatter } from "@/lib/frontmatter";
import { canonicalUrl } from "@/lib/seo";
import type { source } from "@/lib/source";

type MarkdownPage = InferPageType<typeof source> | InferPageType<typeof blogSource>;

/** A real per-page date: a blog post's `updated` or `date`, a doc's last commit, or the API spec's for API pages. */
export function pageLastUpdated(page: MarkdownPage): string | undefined {
	if (page.type === "openapi") return __API_SPEC_UPDATED__ ?? undefined;
	const data = page.data as { updated?: string; date?: string; lastModified?: Date };
	return data.updated ?? data.date ?? data.lastModified?.toISOString().slice(0, 10);
}

export async function getLLMText(page: MarkdownPage) {
	if (page.type === "openapi") {
		return JSON.stringify(page.data.getSchema(), null, 2);
	}

	const processed = await page.data.getText("processed");

	return `# ${page.data.title} (${page.url})

${processed}`;
}

/** One page served on its own, so unlike an llms-full.txt entry it opens with frontmatter. */
export async function getPageMarkdown(page: MarkdownPage) {
	const text = await getLLMText(page);
	if (page.type === "openapi") return text;
	return withFrontmatter(text, {
		title: page.data.title,
		description: page.data.description,
		canonical: canonicalUrl(page.url),
		lastUpdated: pageLastUpdated(page),
	});
}

export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

const NOT_FOUND_MARKDOWN = `# Page not found

There is no page at this URL on elmohq.com. It may have moved, or it may never have existed.

- [llms.txt](${canonicalUrl("/llms.txt")}): an index of the site, written for agents
- [Documentation](${canonicalUrl("/docs.md")})
- [Sitemap](${canonicalUrl("/sitemap.xml")})
- [Home](${canonicalUrl("/")})
`;

export function markdownNotFound(): Response {
	return new Response(NOT_FOUND_MARKDOWN, { status: 404, headers: { "Content-Type": MARKDOWN_CONTENT_TYPE } });
}
