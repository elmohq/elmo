import { cleanAndValidateDomain } from "@/lib/domain-categories";

export type BrandDomainValidationResult = { isValid: true; domain: string } | { isValid: false; error: string };

/**
 * Reduce a user-entered brand domain to the hostname that mentions and
 * citations are matched against. People paste URLs as often as domains, so
 * `https://www.example.com/path` is accepted and stored as `example.com`.
 */
export function validateBrandDomain(input: string): BrandDomainValidationResult {
	if (!input || input.trim() === "") {
		return { isValid: false, error: "Domain is required" };
	}
	const trimmed = input.trim();
	let hostname: string;
	try {
		hostname = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
	} catch {
		return { isValid: false, error: "Please enter a valid domain" };
	}
	const domain = cleanAndValidateDomain(hostname);
	if (!domain) {
		return { isValid: false, error: "Please enter a valid domain" };
	}
	return { isValid: true, domain };
}
