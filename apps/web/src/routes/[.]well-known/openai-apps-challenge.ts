/** OpenAI's plugin portal fetches this to confirm we control the MCP server's domain. */
import { createFileRoute } from "@tanstack/react-router";
import { openaiAppsChallenge } from "@/lib/openai-apps-challenge";

export const Route = createFileRoute("/.well-known/openai-apps-challenge")({
	server: {
		handlers: {
			GET: () => openaiAppsChallenge(process.env.OPENAI_APPS_CHALLENGE_TOKEN),
		},
	},
});
