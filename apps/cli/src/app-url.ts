import { formatEnvValue } from "./config.js";

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

/**
 * Sets keys in a .env file's text without re-rendering it, so comments, hand
 * edits, and the `# Rendered by elmo` header that `elmo upgrade` reads all
 * survive.
 */
export function setEnvValues(contents: string, updates: Record<string, string>): string {
	const lines = contents === "" ? [] : contents.replace(/\n$/, "").split("\n");

	for (const [key, value] of Object.entries(updates)) {
		const assignment = `${key}=${formatEnvValue(value)}`;
		const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
		let found = false;
		for (let i = 0; i < lines.length; i++) {
			if (pattern.test(lines[i])) {
				lines[i] = assignment;
				found = true;
			}
		}
		if (!found) lines.push(assignment);
	}

	return `${lines.join("\n")}\n`;
}
