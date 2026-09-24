import { getDeployment } from "@workspace/deployment";

export const OPENAI_APPS_CHALLENGE_TOKEN = "PLACEHOLDER_OPENAI_APPS_CHALLENGE_TOKEN";

// OpenAI rejects anything but the bare token.
export function openaiAppsChallenge(): Response {
	if (getDeployment().mode !== "cloud") return new Response("Not found", { status: 404 });
	return new Response(OPENAI_APPS_CHALLENGE_TOKEN, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
