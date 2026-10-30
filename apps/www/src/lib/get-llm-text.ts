import type { InferPageType } from "fumadocs-core/source";
import type { blogSource } from "@/lib/blog";
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

export function markdownNotFound(): Response {
	return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
