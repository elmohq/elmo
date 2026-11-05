import { createFileRoute } from "@tanstack/react-router";
import { getLLMText, MARKDOWN_CONTENT_TYPE, markdownNotFound } from "@/lib/get-llm-text";
import { source } from "@/lib/source";

export const Route = createFileRoute("/llms.mdx/docs/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const slugs = params._splat?.split("/") ?? [];
				const page = source.getPage(slugs);
				if (!page) return markdownNotFound();

				return new Response(await getLLMText(page), {
					headers: {
						"Content-Type": MARKDOWN_CONTENT_TYPE,
					},
				});
			},
		},
	},
});
