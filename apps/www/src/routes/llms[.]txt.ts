import { createFileRoute } from "@tanstack/react-router";
import { llmsTxt } from "@/lib/llms-txt";

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET() {
				return new Response(llmsTxt, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
		},
	},
});
