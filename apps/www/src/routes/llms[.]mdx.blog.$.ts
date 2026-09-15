import { createFileRoute } from "@tanstack/react-router";
import { getLLMText, markdownNotFound } from "@/lib/get-llm-text";

export const Route = createFileRoute("/llms.mdx/blog/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				// Lazy import keeps the server-only blog source out of the client
				// bundle (see the note in @/lib/blog).
				const { blogSource } = await import("@/lib/blog");
				const page = blogSource.getPage(params._splat?.split("/") ?? []);
				if (!page) return markdownNotFound();

				return new Response(await getLLMText(page), {
					headers: {
						"Content-Type": "text/markdown",
					},
				});
			},
		},
	},
});
