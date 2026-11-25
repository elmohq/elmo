import type { InferPageType } from "fumadocs-core/source";
import type { blogSource } from "@/lib/blog";
import { withFrontmatter } from "@/lib/frontmatter";
import { pageLastUpdated } from "@/lib/page-dates";
import { canonicalUrl } from "@/lib/seo";
import type { source } from "@/lib/source";

type MarkdownPage = InferPageType<typeof source> | InferPageType<typeof blogSource>;

export async function getLLMText(page: MarkdownPage) {
	if (page.type === "openapi") {
		return JSON.stringify(page.data.getSchema(), null, 2);
	}

	const processed = await page.data.getText("processed");

	return `# ${page.data.title} (${page.url})

${processed}`;
}

export async function getPageMarkdown(page: MarkdownPage) {
	const text = await getLLMText(page);
	if (page.type === "openapi") return text;
	return withFrontmatter(text, {
		title: page.data.title,
		description: page.data.description,
		canonical: canonicalUrl(page.url),
		updated: pageLastUpdated(page),
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
