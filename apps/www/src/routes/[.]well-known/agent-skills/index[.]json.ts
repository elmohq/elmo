import { createFileRoute } from "@tanstack/react-router";
import { skillsIndex } from "@/lib/agent-skills";

export const Route = createFileRoute("/.well-known/agent-skills/index.json")({
	server: {
		handlers: {
			GET: async () =>
				new Response(JSON.stringify(skillsIndex), {
					headers: {
						"Content-Type": "application/json",
						// Read before an agent holds any credential, often cross-origin.
						"Access-Control-Allow-Origin": "*",
					},
				}),
		},
	},
});
