/**
 * Turns what someone typed into the origin Elmo should answer on. Auth trusts
 * requests only from this origin, so a path would never match a browser's
 * Origin header — reject it rather than write a URL sign-in can't work with.
 */
export function parseAppUrl(input: string): { url: string } | { error: string } {
	const trimmed = input.trim();
	let parsed: URL;
	try {
		parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return { error: "Not a valid URL" };
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return { error: "Must start with http:// or https://" };
	}
	if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
		return { error: "Elmo must be served from the root of its domain — drop the path" };
	}
	return { url: parsed.origin };
}
