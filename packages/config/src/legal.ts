/**
 * Where the published legal policies live, and who links to them.
 *
 * The documents themselves are content in the marketing site
 * (packages/docs/content/legal); this is the shared address book so the product
 * app and the marketing site can't drift apart on a URL.
 */
import type { DeploymentMode } from "./types";

const LEGAL_SITE_URL = "https://www.elmohq.com";

interface LegalDocument {
	slug: string;
	title: string;
}

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
	{ slug: "terms", title: "Terms of Service" },
	{ slug: "privacy", title: "Privacy Policy" },
	{ slug: "cookies", title: "Cookie Policy" },
	{ slug: "subprocessors", title: "Subprocessors" },
	{ slug: "acceptable-use", title: "Acceptable Use" },
];

export function legalUrl(slug: string): string {
	return `${LEGAL_SITE_URL}/legal/${slug}`;
}

/**
 * Whether this deployment should link to Elmo's policies. Whitelabel is
 * excluded: those deployments are operated under someone else's agreements, and
 * pointing their users at ours would be wrong.
 */
export function showsLegalLinks(mode: DeploymentMode | undefined): boolean {
	return mode === "cloud" || mode === "demo" || mode === "local";
}
