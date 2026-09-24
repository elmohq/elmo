/** The portal rejects anything but the bare token, so no JSON and no trailing newline. */
export function openaiAppsChallenge(token: string | undefined): Response {
	const value = token?.trim();
	if (!value) return new Response("Not found", { status: 404 });
	return new Response(value, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
