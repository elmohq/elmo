/**
 * Resolving a brand, competitor, or bare domain to a logo.
 *
 * Logos come from Google's favicon service, which takes a site URL and returns
 * that site's icon. Nothing is stored on our side: the browser requests the
 * icon directly, so a brand's logo appears the moment its domain is set.
 */
import { cleanAndValidateDomain } from "@/lib/domain-categories";

const FAVICON_ENDPOINT = "https://t1.gstatic.com/faviconV2";

/** Sizes the service renders crisply; a request is rounded up to the next one. */
const RENDERED_SIZES = [16, 32, 64, 128, 256] as const;

function snapSize(size: number): number {
	return RENDERED_SIZES.find((s) => s >= size) ?? RENDERED_SIZES[RENDERED_SIZES.length - 1];
}

/**
 * Icon URL for a domain or website URL, or null when there's no usable domain.
 *
 * A site the service has no icon for answers 404 (with a generic mark as the
 * body, which browsers discard), so both "no icon" and "request failed" reach
 * the image's error path — that single path is what `BrandLogo`'s fallback
 * glyph covers.
 */
export function faviconUrl(source: string | null | undefined, size = 64): string | null {
	const domain = source ? cleanAndValidateDomain(source) : null;
	if (!domain) return null;

	const params = new URLSearchParams({
		client: "SOCIAL",
		type: "FAVICON",
		fallback_opts: "TYPE,SIZE,URL",
		url: `https://${domain}`,
		size: String(snapSize(size)),
	});
	return `${FAVICON_ENDPOINT}?${params.toString()}`;
}

export interface BrandLogoSubject {
	name: string;
	/** Tried in order; the first that parses as a domain is the logo source. */
	domains: (string | null | undefined)[];
	/** Alternate names this subject is reported under in AI answers. */
	aliases?: string[];
}

/**
 * Index from every name a subject goes by to the domain its logo comes from.
 *
 * Mention data identifies brands by name only, so surfaces that list mentions
 * (leaderboards, per-run badges) need this to get back to a domain. Earlier
 * subjects win a contested name — the brand itself is passed first.
 */
export function buildBrandDomainIndex(subjects: BrandLogoSubject[]): Map<string, string> {
	const index = new Map<string, string>();

	for (const subject of subjects) {
		const domain = subject.domains
			.map((value) => (value ? cleanAndValidateDomain(value) : null))
			.find((value): value is string => Boolean(value));
		if (!domain) continue;

		for (const label of [subject.name, ...(subject.aliases ?? [])]) {
			const key = label?.trim().toLowerCase();
			if (key && !index.has(key)) index.set(key, domain);
		}
	}

	return index;
}

export function domainForName(index: Map<string, string>, name: string | null | undefined): string | undefined {
	return name ? index.get(name.trim().toLowerCase()) : undefined;
}
