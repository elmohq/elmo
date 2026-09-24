import { getDeployment } from "@workspace/deployment";

/** Issued by OpenAI's plugin portal to verify app.elmohq.com, so only Elmo Cloud serves it. */
export const OPENAI_APPS_CHALLENGE_TOKEN = "PLACEHOLDER_OPENAI_APPS_CHALLENGE_TOKEN";

/** The portal rejects anything but the bare token, so no JSON and no trailing newline. */
export function openaiAppsChallenge(): Response {
	if (getDeployment().mode !== "cloud") return new Response("Not found", { status: 404 });
	return new Response(OPENAI_APPS_CHALLENGE_TOKEN, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
