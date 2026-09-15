import type { InferPageType } from "fumadocs-core/source";
import type { blogSource } from "@/lib/blog";
import type { source } from "@/lib/source";

/** Any page with a markdown twin behind /llms.mdx/* — see src/server.ts. */
type MarkdownPage = InferPageType<typeof source> | InferPageType<typeof blogSource>;

export async function getLLMText(page: MarkdownPage) {
	if (page.type === "openapi") {
		return JSON.stringify(page.data.getSchema(), null, 2);
	}

	const processed = await page.data.getText("processed");

	return `# ${page.data.title} (${page.url})

${processed}`;
}

/**
 * A miss on a markdown route answers in place rather than through `notFound()`:
 * these routes are reached with a markdown Accept header, and the HTML renderer
 * rejects anything that doesn't accept HTML.
 */
export function markdownNotFound(): Response {
	return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
