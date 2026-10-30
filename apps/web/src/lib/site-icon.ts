/**
 * Resolving a brand, competitor, or bare domain to a site icon.
 *
 * Icons come from Google's favicon service, which takes a site URL and returns
 * that site's icon. Nothing is stored on our side, so a brand's icon appears
 * the moment its domain is set. Browsers fetch it through our own origin
 * because the service sends no CORS headers, and `SiteIcon` needs to read the
 * pixels to tell whether a mark would vanish against the page.
 */
import { cleanAndValidateDomain } from "@workspace/lib/citations/domain-categories";

const FAVICON_ENDPOINT = "https://t1.gstatic.com/faviconV2";

/** Sizes the service renders crisply; a request is rounded up to the next one. */
const RENDERED_SIZES = [16, 32, 64, 128, 256] as const;

function snapSize(size: number): number {
	return RENDERED_SIZES.find((s) => s >= size) ?? RENDERED_SIZES[RENDERED_SIZES.length - 1];
}

export function upstreamFaviconUrl(domain: string, size: number): string {
	const params = new URLSearchParams({
		client: "SOCIAL",
		type: "FAVICON",
		fallback_opts: "TYPE,SIZE,URL",
		url: `https://${domain}`,
		size: String(snapSize(size)),
	});
	return `${FAVICON_ENDPOINT}?${params.toString()}`;
}

/**
 * Icon URL for a domain or website URL, or null when there's no usable domain.
 *
 * A site the service has no icon for answers 404 with a generic globe in the
 * body, which browsers render like any other image rather than treating as an
 * error — `SiteIcon` is where that placeholder gets spotted and swapped for
 * our own glyph.
 */
export function faviconUrl(source: string | null | undefined, size = 64): string | null {
	const domain = source ? cleanAndValidateDomain(source) : null;
	if (!domain) return null;

	return `/api/site-icon?${new URLSearchParams({ domain, size: String(snapSize(size)) }).toString()}`;
}

const MIN_MARK_ALPHA = 128;
const MAX_MARK_COVERAGE = 0.6;
const LIGHT_MARK_LUMINANCE = 0.8;

// Some sites ship a white mark on transparency, meant for dark browser tabs,
// which vanishes on our light pages.
export function isLightMark(rgba: ArrayLike<number>): boolean {
	let opaque = 0;
	let luminance = 0;
	for (let i = 0; i < rgba.length; i += 4) {
		if (rgba[i + 3] < MIN_MARK_ALPHA) continue;
		opaque++;
		luminance += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
	}

	const pixels = rgba.length / 4;
	if (opaque === 0 || opaque / pixels > MAX_MARK_COVERAGE) return false;

	return luminance / opaque > LIGHT_MARK_LUMINANCE;
}

export interface SiteIconSubject {
	name: string;
	/** Tried in order; the first that parses as a domain is the icon source. */
	domains: (string | null | undefined)[];
	/** Alternate names this subject is reported under in AI answers. */
	aliases?: string[];
}

/**
 * Index from every name a subject goes by to the domain its icon comes from.
 *
 * Mention data identifies brands by name only, so surfaces that list mentions
 * (leaderboards, per-run badges) need this to get back to a domain. Earlier
 * subjects win a contested name — the brand itself is passed first.
 */
export function buildBrandDomainIndex(subjects: SiteIconSubject[]): Map<string, string> {
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
