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
 * which one the URL names must not depend on row order.
 */
export function resolveSegment<T extends SluggableBrand>(items: readonly T[], segment: string): T | undefined {
	return items.find((item) => item.slug === segment) ?? items.find((item) => item.id === segment);
}

export function orgLinkParams(org: SluggableOrg): { org: string } {
	return { org: org.slug };
}

export function brandLinkParams(org: SluggableOrg, brand: SluggableBrand): { org: string; brand: string } {
	return { org: org.slug, brand: brandSegment(brand) };
}

export const ORG_URL_PREFIX = "/app/org/";
export const BRAND_URL_PREFIX = "/brand/";

export const ORG_SETTINGS_PAGES = ["brands", "members", "billing"] as const;
export type OrgSettingsPage = (typeof ORG_SETTINGS_PAGES)[number];

export function orgSettingsPath(org: SluggableOrg, sub?: OrgSettingsPage): string {
	const base = `${ORG_URL_PREFIX}${encodeURIComponent(org.slug)}/settings`;
	return sub ? `${base}/${sub}` : base;
}

export function brandSlugPrefix(org: SluggableOrg): string {
	return `${ORG_URL_PREFIX}${org.slug}${BRAND_URL_PREFIX}`;
}

interface AppLocation {
	pathname: string;
	searchStr: string;
	hash: string;
}

const segmentsIn = (prefix: string) => prefix.split("/").length - 1;
const ORG_SEGMENT_INDEX = segmentsIn(ORG_URL_PREFIX);
const BRAND_SEGMENT_INDEX = ORG_SEGMENT_INDEX + segmentsIn(BRAND_URL_PREFIX);

/**
 * Rebuilt from the parsed pathname rather than sliced out of a serialized href:
 * the segment in the address bar is percent-encoded while the route param is
 * not, so an offset measured from the decoded value lands in the wrong place.
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

export const MAX_SLUG_LENGTH = 48;

export function normalizeSlug(value: string): string {
	return value.trim().toLowerCase();
}

export function isValidSlug(slug: string): boolean {
	if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH) return false;
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Has to agree with `isValidSlug`: anything this returns that the validator
 * would refuse is a record that can be created and then never saved again.
 * `fallback` covers a name with no ASCII alphanumerics, which has no segment to
 * make.
 *
 * Hyphens are trimmed by index walks rather than an `^-+|-+$` alternation,
 * which trips ReDoS scanners on inputs like `"---"` even though the JS engine
 * handles it linearly.
 */
export function slugify(name: string, fallback: string): string {
	const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	let start = 0;
	while (start < cleaned.length && cleaned[start] === "-") start++;
	let end = Math.min(cleaned.length, start + MAX_SLUG_LENGTH);
	while (end > start && cleaned[end - 1] === "-") end--;
	const slug = cleaned.slice(start, end);
	return slug || fallback;
}
