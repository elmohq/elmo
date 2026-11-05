import disposableDomains from "disposable-email-domains";

const BLOCKED_DOMAINS = new Set(disposableDomains.map((d) => d.toLowerCase()));

export function isDisposableEmail(email: string): boolean {
	const at = email.lastIndexOf("@");
	if (at === -1) return false;
	return BLOCKED_DOMAINS.has(
		email
			.slice(at + 1)
			.trim()
			.toLowerCase(),
	);
}
