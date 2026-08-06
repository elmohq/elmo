import { cleanAndValidateDomain } from "@/lib/domain-categories";

export type WebsiteValidationResult = { isValid: true; formattedUrl: string } | { isValid: false; error: string };

/**
 * Validate a user-entered brand website. Accepts either a bare domain
 * (`example.com`) or a full URL, and keeps the path, query, and hash: pointing
 * a brand at `https://www.nike.com/golf` is how a sub-brand gets analyzed from
 * its own section of a larger site. Everything that tracks mentions and
 * citations reduces this to its hostname, so the tracked domain is unchanged
 * either way.
 *
 * Credentials are dropped — this value is handed to the page fetcher.
 */
export function validateWebsiteUrl(input: string): WebsiteValidationResult {
	if (!input || input.trim() === "") {
		return { isValid: false, error: "Website URL is required" };
	}
	let candidate = input.trim();
	if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
		candidate = `https://${candidate}`;
	}
	let urlObj: URL;
	try {
		urlObj = new URL(candidate);
	} catch {
		return { isValid: false, error: "Please enter a valid website URL or domain" };
	}
	if (!cleanAndValidateDomain(urlObj.hostname)) {
		return { isValid: false, error: "Website URL must have a valid domain name" };
	}
	urlObj.username = "";
	urlObj.password = "";
	return { isValid: true, formattedUrl: urlObj.toString() };
}
