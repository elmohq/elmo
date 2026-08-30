/**
 * What goes in a `/app/org/$org/brand/$brand` URL.
 *
 * In `@workspace/lib` rather than beside the router because the dunning mailer
 * mints these too and has to agree with what the router resolves — so this
 * stays pure and dependency-free.
 *
 * An organization always has a slug; a brand may not, and rows that predate
 * slugs fall back to the id.
 */

export interface SluggableOrg {
	slug: string;
}

export interface SluggableBrand {
	id: string;
	slug: string | null;
}

export function brandSegment(brand: SluggableBrand): string {
	return brand.slug ?? brand.id;
}

/**
 * Slug first, then id: an id and another row's slug can both be the segment, so
 * which one the URL names must not depend on row order. `resolveOrganization`
 * encodes the same precedence in SQL.
 */
export function resolveSegment<T extends SluggableBrand>(items: readonly T[], segment: string): T | undefined {
	return items.find((item) => item.slug === segment) ?? items.find((item) => item.id === segment);
}

export function orgParams(org: SluggableOrg): { org: string } {
	return { org: org.slug };
}

export function brandParams(org: SluggableOrg, brand: SluggableBrand): { org: string; brand: string } {
	return { org: org.slug, brand: brandSegment(brand) };
}

/** Exported so the field that edits a segment can show the address around it. */
export const ORG_URL_PREFIX = "/app/org/";
export const BRAND_URL_PREFIX = "/brand/";

/** A string, for the dunning mailer — the one caller that links from outside the router. */
export function orgSettingsPath(org: SluggableOrg, sub?: "members" | "billing"): string {
	const base = `${ORG_URL_PREFIX}${encodeURIComponent(org.slug)}/settings`;
	return sub ? `${base}/${sub}` : base;
}

interface AppLocation {
	pathname: string;
	searchStr: string;
	hash: string;
}

// Counted off the prefixes above rather than written down again, so a prefix
// that moves takes these with it. Splitting keeps the leading "":
// ["", "app", "org", "<org>", "brand", "<brand>", …].
const segmentsIn = (prefix: string) => prefix.split("/").length - 1;
const ORG_SEGMENT_INDEX = segmentsIn(ORG_URL_PREFIX);
const BRAND_SEGMENT_INDEX = ORG_SEGMENT_INDEX + segmentsIn(BRAND_URL_PREFIX);

/**
 * Rebuilt from the parsed pathname rather than sliced out of a serialized href:
 * the segment in the address bar is percent-encoded while the route param is
 * not, so an offset measured from the decoded value lands in the wrong place.
 *
 * The index stays private — callers name the segment instead of passing an
 * integer two call sites could disagree about.
 */
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
 * Here rather than beside the availability checks, because the field in the
 * browser needs the same rules and must not import a module that opens a
 * database connection to get them.
 */
export const MAX_SLUG_LENGTH = 48;

export function isValidSlug(slug: string): boolean {
	if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH) return false;
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * The only producer of a slug, so it has to agree with `isValidSlug`: anything
 * this returns that the validator would refuse is a record that can be created
 * and then never saved again.
 *
 * `fallback` covers a name with no ASCII alphanumerics at all, which has no
 * segment to make — the caller names it, since "brand" on an organization would
 * read as one.
 *
 * Hyphens are trimmed by index walks rather than an `^-+|-+$` alternation,
 * which trips ReDoS scanners on inputs like `"---"` even though the JS engine
 * handles it linearly.
 */
export function slugify(name: string, fallback: string): string {
	const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	let start = 0;
	while (start < cleaned.length && cleaned[start] === "-") start++;
	// Bounded here, not by the caller: a name is as long as someone wants it.
	let end = Math.min(cleaned.length, start + MAX_SLUG_LENGTH);
	while (end > start && cleaned[end - 1] === "-") end--;
	const slug = cleaned.slice(start, end);
	return slug || fallback;
}
