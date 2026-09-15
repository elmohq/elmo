import { createFileRoute } from "@tanstack/react-router";
import { skillsIndex } from "@/lib/agent-skills";

export const Route = createFileRoute("/.well-known/agent-skills/index.json")({
	server: {
		handlers: {
			GET: async () =>
				new Response(JSON.stringify(skillsIndex), {
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				}),
		},
	},
});
