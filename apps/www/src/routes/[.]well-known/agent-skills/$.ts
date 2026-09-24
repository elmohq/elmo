import { createFileRoute } from "@tanstack/react-router";
import { findSkill } from "@/lib/agent-skills";

export const Route = createFileRoute("/.well-known/agent-skills/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const [name, file, ...rest] = params._splat?.split("/") ?? [];
				const skill = file === "SKILL.md" && rest.length === 0 ? findSkill(name) : undefined;
				if (!skill) {
					return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
				}

				return new Response(skill, {
					headers: {
						"Content-Type": "text/markdown; charset=utf-8",
						"Access-Control-Allow-Origin": "*",
					},
				});
			},
		},
	},
});
