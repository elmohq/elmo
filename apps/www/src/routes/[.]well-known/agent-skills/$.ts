import { createFileRoute } from "@tanstack/react-router";
import { findSkillArchive, findSkillFile } from "@/lib/agent-skills";

const CORS = { "Access-Control-Allow-Origin": "*" };

export const Route = createFileRoute("/.well-known/agent-skills/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const splat = params._splat ?? "";

				const archiveName = splat.match(/^([a-z0-9-]+)\.tar\.gz$/)?.[1];
				const archive = archiveName ? findSkillArchive(archiveName) : undefined;
				if (archive) {
					return new Response(new Uint8Array(archive), {
						headers: { ...CORS, "Content-Type": "application/gzip" },
					});
				}

				// Individual files too, so the relative links inside SKILL.md resolve for anyone reading it here.
				const [name, ...rest] = splat.split("/");
				const path = rest.join("/");
				const file = path ? findSkillFile(name, path) : undefined;
				if (file === undefined) {
					return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
				}

				const contentType = path.endsWith(".py") ? "text/x-python" : "text/markdown";
				return new Response(file, {
					headers: { ...CORS, "Content-Type": `${contentType}; charset=utf-8` },
				});
			},
		},
	},
});
