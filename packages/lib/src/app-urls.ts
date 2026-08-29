/**
 * The one place that decides what goes in a `/app/org/$org/brand/$brand` URL.
 *
 * In `@workspace/lib` rather than beside the router because the app is not the
 * only thing that mints these: dunning email links the organization's billing page,
 * and anything else outside the browser that names a page has to agree with what
 * the router resolves. Pure and dependency-free so both sides can import it.
 *
 * An organization always has a slug (`organization.slug` is not null). A brand may
 * not: rows that predate slugs have none, and the segment falls back to the id
 * so their links keep working until someone names one.
 */

export interface SluggableOrg {
	slug: string;
}

export interface SluggableBrand {
	id: string;
	slug: string | null;
}

/** What the `$brand` segment carries for this brand. */
export function brandSegment(brand: SluggableBrand): string {
	return brand.slug ?? brand.id;
}

/** Route params for `/app/org/$org`, so the router still type-checks the target. */
export function orgParams(org: SluggableOrg): { org: string } {
	return { org: org.slug };
}

/** Route params for `/app/org/$org/brand/$brand`. */
export function brandParams(org: SluggableOrg, brand: SluggableBrand): { org: string; brand: string } {
	return { org: org.slug, brand: brandSegment(brand) };
}

/** Exported so the field that edits a segment shows the address around it. */
export const ORG_URL_PREFIX = "/app/org/";
export const BRAND_URL_PREFIX = "/brand/";

/**
 * An organization's settings page as a string, for the one caller that mints a
 * link outside the router: the dunning mailer. Everything inside the app links
 * through route params, which the router encodes itself.
 */
export function orgSettingsPath(org: SluggableOrg, sub?: "members" | "billing"): string {
	const base = `${ORG_URL_PREFIX}${encodeURIComponent(org.slug)}/settings`;
	return sub ? `${base}/${sub}` : base;
}

/**
 * The same URL with one segment swapped for its canonical form.
 *
 * Rebuilt from the parsed pathname, search, and hash rather than sliced out of
 * a serialized href: the segment in the address bar is percent-encoded while
 * the route param is not, so any offset computed from the decoded value lands
 * in the wrong place the moment a slug or id needs encoding.
 *
 * Offsets stay private: callers name the segment they are canonicalizing rather
 * than passing an integer two call sites could silently disagree about.
 */
interface AppLocation {
	pathname: string;
	searchStr: string;
	hash: string;
}

// Which segment of a split pathname each name occupies — counted off the
// prefixes above rather than written down a second time, so a prefix that moves
// takes these with it. ["", "app", "org", "<org>", "brand", "<brand>", …], with
// the leading "" kept.
const segmentsIn = (prefix: string) => prefix.split("/").length - 1;
const ORG_SEGMENT_INDEX = segmentsIn(ORG_URL_PREFIX);
const BRAND_SEGMENT_INDEX = ORG_SEGMENT_INDEX + segmentsIn(BRAND_URL_PREFIX);

function canonicalHref(location: AppLocation, segmentIndex: number, value: string): string {
	const segments = location.pathname.split("/");
	segments[segmentIndex] = encodeURIComponent(value);
	return `${segments.join("/")}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`;
}

export function canonicalOrgHref(location: AppLocation, org: string): string {
	return canonicalHref(location, ORG_SEGMENT_INDEX, org);
}

export function canonicalBrandHref(location: AppLocation, brand: string): string {
	return canonicalHref(location, BRAND_SEGMENT_INDEX, brand);
}

/**
 * How long a slug may be, and what one may contain: lowercase alphanumerics and
 * interior hyphens, bounded so a slug always reads as a URL segment rather than
 * a paragraph.
 *
 * Here rather than beside the database helpers that check availability, because
 * the field in the browser needs the same rules and must not import a module
 * that opens a database connection to get them.
 */
export const MAX_SLUG_LENGTH = 48;

export function isValidSlug(slug: string): boolean {
	if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH) return false;
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * A name as a slug. Beside `isValidSlug` because it is the only producer of
 * one, and the two have to agree: a slug this returns that the validator would
 * refuse is a record that can be created and then never saved again.
 *
 * Leading/trailing hyphens are trimmed by index walks rather than an
 * `^-+|-+$` alternation regex — the alternation form trips ReDoS scanners on
 * inputs like `"---"` even though the JS engine handles it linearly.
 */
export function slugify(name: string): string {
	const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	let start = 0;
	while (start < cleaned.length && cleaned[start] === "-") start++;
	// Bounded here rather than by the caller: a name is as long as someone
	// wants it, and the segment it becomes is not.
	let end = Math.min(cleaned.length, start + MAX_SLUG_LENGTH);
	while (end > start && cleaned[end - 1] === "-") end--;
	const slug = cleaned.slice(start, end);
	return slug || "brand";
}
