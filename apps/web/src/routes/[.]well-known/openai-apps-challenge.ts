import { createFileRoute } from "@tanstack/react-router";
import { openaiAppsChallenge } from "@/lib/openai-apps-challenge";

export const Route = createFileRoute("/.well-known/openai-apps-challenge")({
	server: {
		handlers: {
			GET: openaiAppsChallenge,
		},
	},
});
