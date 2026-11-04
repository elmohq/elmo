import { createFileRoute } from "@tanstack/react-router";
import { MARKDOWN_CONTENT_TYPE } from "@/lib/get-llm-text";
import { authDocument } from "@/lib/auth-md";

export const Route = createFileRoute("/auth.md")({
	server: {
		handlers: {
			GET: async () =>
				new Response(authDocument, {
					headers: {
						"Content-Type": MARKDOWN_CONTENT_TYPE,
						"Access-Control-Allow-Origin": "*",
					},
				}),
		},
	},
});
