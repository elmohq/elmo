/**
 * The one place that decides what goes in a `/app/org/$org/brand/$brand` URL.
 *
 * In `@workspace/lib` rather than beside the router because the app is not the
 * only thing that mints these: dunning email links the workspace's billing page,
 * and anything else outside the browser that names a page has to agree with what
 * the router resolves. Pure and dependency-free so both sides can import it.
 *
 * A workspace always has a slug (`organization.slug` is not null). A brand may
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

/** What the `$org` segment carries for this workspace. */
export function orgSegment(org: SluggableOrg): string {
	return org.slug;
}

/** What the `$brand` segment carries for this brand. */
export function brandSegment(brand: SluggableBrand): string {
	return brand.slug ?? brand.id;
}

/** Route params for `/app/org/$org`, so the router still type-checks the target. */
export function orgParams(org: SluggableOrg): { org: string } {
	return { org: orgSegment(org) };
}

/** Route params for `/app/org/$org/brand/$brand`. */
export function brandParams(org: SluggableOrg, brand: SluggableBrand): { org: string; brand: string } {
	return { org: orgSegment(org), brand: brandSegment(brand) };
}

/**
 * What precedes each segment. Exported because the settings field that edits a
 * segment shows the address around it, and a second copy of "/app/org/" typed
 * into a component is a copy that stops matching the day the shape moves.
 */
export const WORKSPACE_URL_PREFIX = "/app/org/";
export const BRAND_URL_PREFIX = "/brand/";

/** The canonical URL for a workspace, for links minted outside the router. */
export function workspacePath(org: SluggableOrg): string {
	return `${WORKSPACE_URL_PREFIX}${encodeURIComponent(orgSegment(org))}`;
}

export function brandPath(org: SluggableOrg, brand: SluggableBrand): string {
	return `${workspacePath(org)}${BRAND_URL_PREFIX}${encodeURIComponent(brandSegment(brand))}`;
}

export function workspaceSettingsPath(org: SluggableOrg, sub?: "members" | "billing"): string {
	return sub ? `${workspacePath(org)}/settings/${sub}` : `${workspacePath(org)}/settings`;
}

/**
 * The same URL with one segment swapped for its canonical form.
 *
 * Rebuilt from the parsed pathname, search, and hash rather than sliced out of
 * a serialized href: the segment in the address bar is percent-encoded while
 * the route param is not, so any offset computed from the decoded value lands
 * in the wrong place the moment a slug or id needs encoding.
 *
 * The offsets stay private. A caller names the segment it is canonicalizing —
 * `canonicalOrgHref`, `canonicalBrandHref` — rather than passing an integer,
 * because an integer is a thing two call sites can disagree about silently.
 */
interface AppLocation {
	pathname: string;
	searchStr: string;
	hash: string;
}

// ["", "app", "org", "<org>", "brand", "<brand>", ...]. The leading empty
// string is kept, so these read as they do in the URL.
const ORG_SEGMENT_INDEX = 3;
const BRAND_SEGMENT_INDEX = 5;

function canonicalHref(location: AppLocation, segmentIndex: number, value: string): string {
	const segments = location.pathname.split("/");
	segments[segmentIndex] = encodeURIComponent(value);
	return `${segments.join("/")}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`;
}

/** The current URL with the workspace segment replaced by its canonical form. */
export function canonicalOrgHref(location: AppLocation, org: string): string {
	return canonicalHref(location, ORG_SEGMENT_INDEX, org);
}

/** The current URL with the brand segment replaced by its canonical form. */
export function canonicalBrandHref(location: AppLocation, brand: string): string {
	return canonicalHref(location, BRAND_SEGMENT_INDEX, brand);
}

/**
 * The identifier a pre-workspace `/app/…` link was naming, and whatever
 * followed it.
 *
 * `/app/nike/citations` used to mean "the brand nike"; the same URL now has a
 * workspace where the brand is. Splitting that here — rather than in the server
 * function that looks the name up — keeps the URL arithmetic testable without a
 * database, and keeps `/app/org/…` (the current shape, whose misses are real
 * 404s) from being retried as a brand name.
 *
 * Null for anything that isn't an `/app/<something>` path.
 */
export function parseStrandedAppPath(pathname: string): { candidate: string; rest: string } | null {
	// ["", "app", "<candidate>", ...rest]
	const segments = pathname.split("/");
	if (segments[1] !== "app" || !segments[2]) return null;
	if (segments[2] === "org") return null;

	let candidate: string;
	try {
		candidate = decodeURIComponent(segments[2]);
	} catch {
		return null;
	}

	return { candidate, rest: segments.slice(3).join("/") };
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
