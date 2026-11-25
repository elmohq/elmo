export function normalizeHost(input: string): string {
	const trimmed = input.trim();
	try {
		const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
		return url.hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return trimmed.toLowerCase().replace(/^www\./, "");
	}
}

export function homepageUrl(input: string): string {
	const trimmed = input.trim();
	const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
	return `${url.protocol}//${url.host}/`;
}
